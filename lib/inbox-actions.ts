"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { logAudit } from "@/lib/admin";
import { sendSms } from "@/lib/twilio";

export type InboxResult = { ok: true } | { ok: false; error: string };

const STATUS_VALUES = new Set(["sequencing", "replied", "won", "lost", "paused"]);

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
