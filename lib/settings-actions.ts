"use server";

import { createHash, randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { logAudit } from "@/lib/admin";
import { sendSms } from "@/lib/twilio";

export type SettingsResult = { ok: true } | { ok: false; error: string };

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}

async function acting() {
  const a = await getActingCompany();
  if (!a) redirect("/login");
  if (!a.companyId) throw new Error("No company");
  return a;
}

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

// Step 1 of changing the relay cell: text a 6-digit code to the new number.
// The relay cell receives homeowners' reply threads, so it never goes live
// unverified - a typo'd number would hand a stranger someone else's leads.
export async function requestRelayCellCode(cell: string): Promise<SettingsResult> {
  const phone = normalizePhone(cell);
  if (!phone) return { ok: false, error: "Enter a valid US mobile number." };
  const a = await acting();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await a.client
    .from("users")
    .update({
      pending_cell_phone: phone,
      pending_cell_code_hash: hashCode(code),
      pending_cell_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      pending_cell_attempts: 0,
    })
    .eq("company_id", a.companyId!);
  if (error) return { ok: false, error: "Could not start verification. Try again." };
  const res = await sendSms({
    companyId: a.companyId!,
    prospectId: null,
    to: phone,
    body: `ReKnock: your verification code is ${code}. It expires in 10 minutes.`,
    idempotencyKey: `cell_verify:${a.companyId}:${Date.now()}`,
    kind: "system",
  });
  if (!res.sent) return { ok: false, error: "We could not text that number. Double-check it and try again." };
  return { ok: true };
}

// Step 2: the code proves the phone is theirs; only then does it become the
// live relay target.
export async function verifyRelayCellCode(code: string): Promise<SettingsResult> {
  const a = await acting();
  const { data: u } = await a.client
    .from("users")
    .select("id, pending_cell_phone, pending_cell_code_hash, pending_cell_expires_at, pending_cell_attempts")
    .eq("company_id", a.companyId!)
    .not("pending_cell_phone", "is", null)
    .limit(1)
    .maybeSingle();
  if (!u?.pending_cell_phone || !u.pending_cell_code_hash) return { ok: false, error: "Request a new code first." };
  if (u.pending_cell_expires_at && new Date(u.pending_cell_expires_at) < new Date()) {
    return { ok: false, error: "That code expired. Request a new one." };
  }
  if ((u.pending_cell_attempts ?? 0) >= 5) return { ok: false, error: "Too many tries. Request a new code." };
  if (hashCode(code.trim()) !== u.pending_cell_code_hash) {
    await a.client.from("users").update({ pending_cell_attempts: (u.pending_cell_attempts ?? 0) + 1 }).eq("id", u.id);
    return { ok: false, error: "That code does not match. Check the text and try again." };
  }
  const { error } = await a.client
    .from("users")
    .update({
      cell_phone: u.pending_cell_phone,
      cell_phone_verified_at: new Date().toISOString(),
      pending_cell_phone: null,
      pending_cell_code_hash: null,
      pending_cell_expires_at: null,
      pending_cell_attempts: 0,
    })
    .eq("id", u.id);
  if (error) return { ok: false, error: "Could not save. Try again." };
  if (a.impersonating) {
    await logAudit(a.client, { actorUserId: a.actorUserId, actorEmail: a.actorEmail, action: "support_set_relay_cell", targetCompanyId: a.companyId, metadata: { verified: true } });
  }
  return { ok: true };
}

// The cell we text when a homeowner replies (reply relay).
// Unverified direct saves are no longer reachable from the UI (OTP flow
// above); kept for admin support tooling.
export async function setRelayCell(cell: string): Promise<SettingsResult> {
  const phone = normalizePhone(cell);
  if (!phone) return { ok: false, error: "Enter a valid US mobile number." };
  const a = await acting();
  const { error } = await a.client.from("users").update({ cell_phone: phone }).eq("company_id", a.companyId!);
  if (error) return { ok: false, error: "Could not save." };
  if (a.impersonating) {
    await logAudit(a.client, { actorUserId: a.actorUserId, actorEmail: a.actorEmail, action: "support_set_relay_cell", targetCompanyId: a.companyId, metadata: {} });
  }
  return { ok: true };
}

// Sender emails for the shared quotes@ intake address. The login email is
// seeded verified; extra senders (personal + business) confirm via an emailed
// link before their mail can create prospects (From: headers are spoofable).
export async function addSenderEmail(email: string): Promise<SettingsResult> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return { ok: false, error: "Enter a valid email address." };
  const a = await acting();
  const token = createHash("sha256").update(`${clean}:${randomInt(0, 2 ** 48)}:${Date.now()}`).digest("hex");
  const { error } = await a.client
    .from("company_sender_emails")
    .insert({ company_id: a.companyId, email: clean, verify_token: token });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That email is already registered." };
    return { ok: false, error: "Could not add that email. Try again." };
  }
  const appUrl = process.env.APP_URL ?? "";
  try {
    const key = process.env.RESEND_API_KEY;
    if (!key || !appUrl) throw new Error("email not configured");
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: "ReKnock <ops@getreknock.com>",
        to: [clean],
        subject: "Confirm this email for ReKnock quote forwarding",
        text: `Confirm that you'll forward quote emails from this address, and we'll chase every quote you send us.\n\nConfirm: ${appUrl}/api/verify-sender?token=${token}\n\nIf you didn't request this, ignore this email.`,
      }),
    });
    if (!resp.ok) throw new Error(`Resend ${resp.status}`);
  } catch {
    // Leave the row (they can resend by removing + re-adding); tell the truth.
    return { ok: false, error: "Added, but the confirmation email failed to send. Remove and re-add to retry." };
  }
  return { ok: true };
}

export async function removeSenderEmail(id: string): Promise<SettingsResult> {
  const a = await acting();
  const { error } = await a.client.from("company_sender_emails").delete().eq("id", id).eq("company_id", a.companyId!);
  if (error) return { ok: false, error: "Could not remove it." };
  return { ok: true };
}

// "Notify me" on a coming-soon feature; the demand signal (CLAUDE.md Phase 7).
export async function logFeatureInterest(feature: string): Promise<SettingsResult> {
  const a = await acting();
  await a.client.from("events").insert({ company_id: a.companyId, type: "feature_interest", payload: { feature } });
  return { ok: true };
}
