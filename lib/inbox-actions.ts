"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { logAudit } from "@/lib/admin";
import { sendSms, canSendNow, nextSendTime } from "@/lib/twilio";
import { generateText } from "@/lib/ai";
import { buildFollowupDrafterPrompt, enforceCompliance, fillTemplate } from "@/lib/prompts/followup-drafter";
import { cancelScheduledForProspect, rearmSequence } from "@/lib/enrollment";

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

  // Keep the scheduled rows honest. Terminal states cancel pending touches;
  // Resume actually re-arms them (canceled rows flip back to scheduled,
  // re-timed from now). Paused just defers at send time.
  if (status === "won" || status === "lost" || status === "replied") {
    await cancelScheduledForProspect(prospectId, status);
  } else if (status === "sequencing") {
    const rearmed = await rearmSequence({
      companyId: a.companyId!,
      prospectId,
      testMode: process.env.VERCEL_ENV !== "production",
    });
    await a.client.from("events").insert({
      company_id: a.companyId!,
      type: "sequence_resumed",
      payload: { prospect_id: prospectId, rearmed_steps: rearmed },
    });
  }
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

// Timeline editing. The scheduled `messages` rows ARE the prospect's
// timeline: every touch is individually movable, rewritable, deletable, and
// new touches can be added at any date/time. Times are validated against the
// company's sending windows + the TCPA floor; an out-of-window pick returns
// the nearest valid slot as a suggestion instead of silently deferring.

export type TimeResult = { ok: true } | { ok: false; error: string; suggestionIso?: string };

async function checkSendTime(
  client: ReturnType<typeof Object> & { from: (t: string) => any },
  companyId: string,
  iso: string,
): Promise<{ when: Date } | { error: string; suggestionIso?: string }> {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return { error: "Pick a date and time." };
  if (when.getTime() < Date.now() + 2 * 60_000) return { error: "Pick a time in the future." };
  if (when.getTime() > Date.now() + 366 * 86400_000) return { error: "That is over a year out. Pick a closer date." };

  const [{ data: co }, { data: windows }] = await Promise.all([
    client.from("companies").select("timezone").eq("id", companyId).maybeSingle(),
    client.from("sending_windows").select("day_of_week, start_time, end_time, enabled").eq("company_id", companyId),
  ]);
  const tz = co?.timezone ?? "America/New_York";
  if (!canSendNow(tz, windows ?? [], when)) {
    const next = nextSendTime(tz, windows ?? [], when);
    return {
      error: "That time is outside your sending hours (or the 8am to 9pm texting rules).",
      suggestionIso: next?.toISOString(),
    };
  }
  return { when };
}

// Move one upcoming touch to any date and time.
export async function rescheduleTouch(messageId: string, newIso: string): Promise<TimeResult> {
  const a = await acting();
  const check = await checkSendTime(a.client, a.companyId!, newIso);
  if ("error" in check) return { ok: false, error: check.error, suggestionIso: check.suggestionIso };

  const { data: updated, error } = await a.client
    .from("messages")
    .update({ scheduled_for: check.when.toISOString(), send_meta: { reason: "user_reschedule" } })
    .eq("id", messageId)
    .eq("company_id", a.companyId!)
    .eq("status", "scheduled")
    .select("id");
  if (error) return { ok: false, error: "Could not reschedule." };
  if (!updated?.length) return { ok: false, error: "That follow-up already went out or was canceled." };
  return { ok: true };
}

// The contractor's own words fully override our draft for that send. Empty
// text switches the touch back to auto-drafting.
export async function saveTouchMessage(messageId: string, text: string): Promise<InboxResult> {
  const a = await acting();
  const custom = text.trim();
  const { data: updated, error } = await a.client
    .from("messages")
    .update(custom ? { body: custom.slice(0, 320), body_is_custom: true } : { body: null, body_is_custom: false })
    .eq("id", messageId)
    .eq("company_id", a.companyId!)
    .eq("status", "scheduled")
    .select("id");
  if (error) return { ok: false, error: "Could not save." };
  if (!updated?.length) return { ok: false, error: "That follow-up already went out or was canceled." };
  return { ok: true };
}

// Remove a touch from the timeline entirely (kept in the ledger as canceled;
// Resume never brings user-deleted touches back).
export async function deleteTouch(messageId: string): Promise<InboxResult> {
  const a = await acting();
  const { data: updated, error } = await a.client
    .from("messages")
    .update({ status: "canceled", send_meta: { reason: "user_delete" } })
    .eq("id", messageId)
    .eq("company_id", a.companyId!)
    .eq("status", "scheduled")
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "That follow-up already went out or was canceled." };
  return { ok: true };
}

// Add an extra touch at any date/time, with optional custom text (otherwise
// we draft it in their voice at send time).
export async function addTouch(prospectId: string, iso: string, customText?: string): Promise<TimeResult> {
  const a = await acting();
  const { data: p } = await a.client
    .from("prospects")
    .select("id, status, phone_e164")
    .eq("id", prospectId)
    .eq("company_id", a.companyId!)
    .maybeSingle();
  if (!p) return { ok: false, error: "Prospect not found." };
  if (p.status === "opted_out") return { ok: false, error: "This contact opted out. You cannot text them." };
  if (!p.phone_e164) return { ok: false, error: "No phone number for this prospect." };

  const check = await checkSendTime(a.client, a.companyId!, iso);
  if ("error" in check) return { ok: false, error: check.error, suggestionIso: check.suggestionIso };

  const custom = customText?.trim();
  const { error } = await a.client.from("messages").insert({
    company_id: a.companyId!,
    prospect_id: prospectId,
    direction: "outbound",
    channel: "sms",
    kind: "sequence",
    status: "scheduled",
    scheduled_for: check.when.toISOString(),
    sequence_step: null,
    step_intent: "friendly follow-up",
    body: custom ? custom.slice(0, 320) : null,
    body_is_custom: Boolean(custom),
    idempotency_key: `extra:${crypto.randomUUID()}`,
  });
  if (error) return { ok: false, error: "Could not add the follow-up." };
  return { ok: true };
}

// Reminders ("circle back in March"). remind_me pings the contractor's cell at
// that time; auto_send schedules an AI-drafted message (in their voice,
// referencing the earlier quote) that sends automatically inside sending
// hours. Opt-out/status/windows are evaluated at send time, not now.
export async function createReminder(
  prospectId: string,
  remindAtIso: string,
  mode: "remind_me" | "auto_send",
  note?: string,
): Promise<InboxResult> {
  const when = new Date(remindAtIso);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Pick a date and time." };
  if (when.getTime() < Date.now() + 4 * 60_000) return { ok: false, error: "Pick a time in the future." };
  if (when.getTime() > Date.now() + 366 * 86400_000) return { ok: false, error: "That is over a year out. Pick a closer date." };

  const a = await acting();
  const { data: p } = await a.client
    .from("prospects")
    .select("id, status, phone_e164")
    .eq("id", prospectId)
    .eq("company_id", a.companyId!)
    .maybeSingle();
  if (!p) return { ok: false, error: "Prospect not found." };
  if (p.status === "opted_out" && mode === "auto_send")
    return { ok: false, error: "This contact opted out. Set a remind-me instead and give them a call." };
  if (!p.phone_e164 && mode === "auto_send") return { ok: false, error: "No phone number for this prospect." };

  const { data: rem, error } = await a.client
    .from("reminders")
    .insert({
      company_id: a.companyId!,
      prospect_id: prospectId,
      remind_at: when.toISOString(),
      mode,
      note: note?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !rem) return { ok: false, error: "Could not save the reminder." };

  if (mode === "auto_send") {
    const { data: msg, error: msgErr } = await a.client
      .from("messages")
      .insert({
        company_id: a.companyId!,
        prospect_id: prospectId,
        direction: "outbound",
        channel: "sms",
        kind: "reminder",
        status: "scheduled",
        scheduled_for: when.toISOString(),
        idempotency_key: `reminder:${rem.id}`,
      })
      .select("id")
      .single();
    if (msgErr || !msg) {
      await a.client.from("reminders").update({ status: "canceled" }).eq("id", rem.id);
      return { ok: false, error: "Could not schedule the message. Try again." };
    }
    await a.client.from("reminders").update({ message_id: msg.id }).eq("id", rem.id);
  }

  await a.client.from("events").insert({
    company_id: a.companyId!,
    type: "reminder_created",
    payload: { prospect_id: prospectId, mode, remind_at: when.toISOString() },
  });
  return { ok: true };
}

export async function cancelReminder(reminderId: string): Promise<InboxResult> {
  const a = await acting();
  const { data: rem } = await a.client
    .from("reminders")
    .update({ status: "canceled" })
    .eq("id", reminderId)
    .eq("company_id", a.companyId!)
    .eq("status", "pending")
    .select("message_id");
  const messageId = rem?.[0]?.message_id;
  if (messageId) {
    await a.client
      .from("messages")
      .update({ status: "canceled", send_meta: { reason: "reminder_canceled" } })
      .eq("id", messageId)
      .eq("status", "scheduled");
  }
  return { ok: true };
}

export type DraftResult =
  | { ok: true; text: string; kind: "ai" | "custom" | "template" }
  | { ok: false; error: string };

// The actual message a scheduled touch will send: the contractor's own text
// if they set one, the snapshotted template, or a live AI draft in their
// voice. On-demand so the inbox load stays fast.
export async function draftTouchPreview(messageId: string): Promise<DraftResult> {
  const a = await acting();
  const sb = a.client;
  const { data: msg } = await sb
    .from("messages")
    .select("prospect_id, body, body_is_custom, step_intent, step_template")
    .eq("id", messageId)
    .eq("company_id", a.companyId!)
    .eq("status", "scheduled")
    .maybeSingle();
  if (!msg?.prospect_id) return { ok: false, error: "That follow-up already went out or was canceled." };
  if (msg.body_is_custom && msg.body?.trim()) return { ok: true, text: msg.body, kind: "custom" };

  const [{ data: p }, { data: co }, { data: voice }] = await Promise.all([
    sb.from("prospects").select("first_name, job_type, quote_amount, quote_date, notes").eq("id", msg.prospect_id).maybeSingle(),
    sb.from("companies").select("name").eq("id", a.companyId!).maybeSingle(),
    sb.from("voice_profiles").select("master_prompt").eq("company_id", a.companyId!).eq("is_latest", true).maybeSingle(),
  ]);
  if (!p) return { ok: false, error: "Prospect not found." };

  const businessName = co?.name ?? "your contractor";
  const fillCtx = { firstName: p.first_name ?? "there", jobType: p.job_type, quoteAmount: p.quote_amount, businessName };
  if (msg.step_template?.trim()) return { ok: true, text: fillTemplate(msg.step_template, fillCtx), kind: "template" };

  // Same first-touch rule as the engine: it is first if nothing has been
  // sent to this homeowner yet.
  const { data: prior } = await sb
    .from("messages")
    .select("id")
    .eq("prospect_id", msg.prospect_id)
    .eq("direction", "outbound")
    .eq("status", "sent")
    .in("kind", ["sequence", "reminder", "manual", "relay"])
    .limit(1);
  const isFirst = !prior?.length;
  const daysSince = p.quote_date
    ? Math.max(0, Math.round((Date.now() - new Date(`${p.quote_date}T12:00:00Z`).getTime()) / 86400000))
    : 0;
  const { system, prompt, temperature, maxTokens } = buildFollowupDrafterPrompt(
    voice?.master_prompt ?? "",
    { businessName, firstName: p.first_name ?? "there", jobType: p.job_type, quoteAmount: p.quote_amount, daysSinceQuote: daysSince, notes: p.notes },
    msg.step_intent ?? "friendly follow-up",
    isFirst,
  );
  try {
    const { text } = await generateText({ system, prompt, temperature, maxTokens });
    return { ok: true, text: enforceCompliance(text, isFirst, businessName), kind: "ai" };
  } catch {
    return { ok: false, error: "Could not draft that. Try again." };
  }
}
