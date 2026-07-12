"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { logAudit } from "@/lib/admin";
import { sendSms } from "@/lib/twilio";
import { generateText } from "@/lib/ai";
import { buildFollowupDrafterPrompt, enforceCompliance, fillTemplate } from "@/lib/prompts/followup-drafter";
import { DEFAULT_CAMPAIGN_STEPS, type CampaignStep } from "@/lib/campaign";

export type InboxResult = { ok: true } | { ok: false; error: string };

const STATUS_VALUES = new Set(["sequencing", "replied", "won", "lost", "paused"]);

function normPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (raw.trim().startsWith("+") && d.length >= 8) return `+${d}`;
  return null;
}

async function acting() {
  const a = await getActingCompany();
  if (!a) redirect("/login");
  if (!a.companyId) throw new Error("No company");
  return a;
}

// Manual reply from the contractor. Sends from the ReKnock number and pauses the
// remaining automated sequence (the send step skips 'paused'). Human action, so
// no model output rule applies.
export async function sendManualMessage(prospectId: string, body: string): Promise<InboxResult> {
  const text = body.trim();
  if (!text) return { ok: false, error: "Nothing to send." };
  const a = await acting();

  const { data: p } = await a.client
    .from("prospects")
    .select("id, phone_e164, status")
    .eq("id", prospectId)
    .eq("company_id", a.companyId!)
    .maybeSingle();
  if (!p?.phone_e164) return { ok: false, error: "No phone number for this prospect." };
  if (p.status === "opted_out") return { ok: false, error: "This contact opted out. You cannot text them." };

  const res = await sendSms({
    companyId: a.companyId!,
    prospectId,
    to: p.phone_e164,
    body: text,
    idempotencyKey: `manual:${crypto.randomUUID()}`,
  });
  if (!res.sent) {
    return { ok: false, error: res.skipped === "dev_allowlist" ? "Dev mode only texts your allowlisted number." : "Could not send. Try again." };
  }

  // Pause the sequence so we do not talk over the contractor.
  await a.client.from("prospects").update({ status: "paused" }).eq("id", prospectId).eq("company_id", a.companyId!);

  if (a.impersonating) {
    await logAudit(a.client, { actorUserId: a.actorUserId, actorEmail: a.actorEmail, action: "support_manual_message", targetCompanyId: a.companyId, metadata: { prospect_id: prospectId } });
  }
  return { ok: true };
}

export async function setProspectStatus(prospectId: string, status: string): Promise<InboxResult> {
  if (!STATUS_VALUES.has(status)) return { ok: false, error: "Unknown status." };
  const a = await acting();
  const { error } = await a.client.from("prospects").update({ status }).eq("id", prospectId).eq("company_id", a.companyId!);
  if (error) return { ok: false, error: "Could not update." };
  if (a.impersonating) {
    await logAudit(a.client, { actorUserId: a.actorUserId, actorEmail: a.actorEmail, action: "support_set_status", targetCompanyId: a.companyId, metadata: { prospect_id: prospectId, status } });
  }
  return { ok: true };
}

const PROSPECT_TEXT_FIELDS = ["first_name", "last_name", "job_type", "email", "address", "notes"] as const;

// Edit the captured prospect details + notes from the thread panel. Notes flow
// into the AI drafting context for future messages.
export async function updateProspect(prospectId: string, fields: Record<string, string>): Promise<InboxResult> {
  const a = await acting();
  const patch: Record<string, unknown> = {};
  for (const k of PROSPECT_TEXT_FIELDS) if (k in fields) patch[k] = (fields[k] ?? "").trim() || null;
  if ("quote_amount" in fields) {
    const amt = (fields.quote_amount ?? "").replace(/[^0-9.]/g, "");
    patch.quote_amount = amt ? Number(amt) : null;
  }
  if ("phone" in fields) {
    const p = normPhone(fields.phone ?? "");
    if (!p) return { ok: false, error: "Enter a valid US phone number." };
    patch.phone_e164 = p;
  }
  if (!Object.keys(patch).length) return { ok: true };
  const { error } = await a.client.from("prospects").update(patch).eq("id", prospectId).eq("company_id", a.companyId!);
  if (error) return { ok: false, error: "Could not save." };
  if (a.impersonating) {
    await logAudit(a.client, { actorUserId: a.actorUserId, actorEmail: a.actorEmail, action: "support_update_prospect", targetCompanyId: a.companyId, metadata: { prospect_id: prospectId } });
  }
  return { ok: true };
}

export type DraftResult =
  | { ok: true; text: string; kind: "ai" | "custom" | "template" | "skip" }
  | { ok: false; error: string };

// The actual message a given upcoming step will send: an override, a fixed
// template, or a live AI draft in the contractor's voice. Used when a scheduled
// pill is opened in the thread. On-demand so the inbox load stays fast.
export async function getScheduledDraft(prospectId: string, stepIndex: number): Promise<DraftResult> {
  const a = await acting();
  const sb = a.client;
  const [{ data: p }, { data: co }, { data: voice }] = await Promise.all([
    sb.from("prospects").select("first_name, job_type, quote_amount, quote_date, campaign_id, notes").eq("id", prospectId).eq("company_id", a.companyId!).maybeSingle(),
    sb.from("companies").select("name").eq("id", a.companyId!).maybeSingle(),
    sb.from("voice_profiles").select("master_prompt").eq("company_id", a.companyId!).eq("is_latest", true).maybeSingle(),
  ]);
  if (!p) return { ok: false, error: "Prospect not found." };

  let steps: CampaignStep[] = DEFAULT_CAMPAIGN_STEPS;
  if (p.campaign_id) {
    const { data: c } = await sb.from("campaigns").select("steps").eq("id", p.campaign_id).maybeSingle();
    const cs = c?.steps as CampaignStep[] | null;
    if (Array.isArray(cs) && cs.length) steps = cs;
  }
  const s = steps[stepIndex];
  if (!s) return { ok: false, error: "No such step." };

  const businessName = co?.name ?? "your contractor";
  const { data: override } = await sb.from("sequence_overrides").select("action, custom_text").eq("prospect_id", prospectId).eq("step_index", stepIndex).maybeSingle();
  if (override?.action === "skip") return { ok: true, text: "", kind: "skip" };
  if (override?.action === "custom" && override.custom_text?.trim()) return { ok: true, text: override.custom_text, kind: "custom" };

  const fillCtx = { firstName: p.first_name ?? "there", jobType: p.job_type, quoteAmount: p.quote_amount, businessName };
  if (s.template?.trim()) return { ok: true, text: fillTemplate(s.template, fillCtx), kind: "template" };

  const isFirst = stepIndex === 0;
  const daysSince = p.quote_date
    ? Math.max(0, Math.round((Date.now() - new Date(`${p.quote_date}T12:00:00Z`).getTime()) / 86400000))
    : s.day_offset ?? 0;
  const { system, prompt, temperature, maxTokens } = buildFollowupDrafterPrompt(
    voice?.master_prompt ?? "",
    { businessName, firstName: p.first_name ?? "there", jobType: p.job_type, quoteAmount: p.quote_amount, daysSinceQuote: daysSince, notes: p.notes },
    s.intent ?? "friendly follow-up",
    isFirst,
  );
  try {
    const { text } = await generateText({ system, prompt, temperature, maxTokens });
    return { ok: true, text: enforceCompliance(text, isFirst, businessName), kind: "ai" };
  } catch {
    return { ok: false, error: "Could not draft that. Try again." };
  }
}

// Edit or skip a specific upcoming step for one prospect. Honored by the
// sequence engine at send time (opt-out/status still win).
export async function setStepOverride(
  prospectId: string,
  stepIndex: number,
  action: "skip" | "custom" | "clear",
  customText?: string,
): Promise<InboxResult> {
  const a = await acting();
  const sb = a.client;
  const { data: p } = await sb.from("prospects").select("id").eq("id", prospectId).eq("company_id", a.companyId!).maybeSingle();
  if (!p) return { ok: false, error: "Prospect not found." };

  if (action === "clear") {
    await sb.from("sequence_overrides").delete().eq("prospect_id", prospectId).eq("step_index", stepIndex).eq("company_id", a.companyId!);
    return { ok: true };
  }
  if (action === "custom" && !customText?.trim()) return { ok: false, error: "Enter a message." };
  const { error } = await sb.from("sequence_overrides").upsert(
    {
      company_id: a.companyId!,
      prospect_id: prospectId,
      step_index: stepIndex,
      action,
      custom_text: action === "custom" ? customText!.trim() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "prospect_id,step_index" },
  );
  if (error) return { ok: false, error: "Could not save." };
  return { ok: true };
}
