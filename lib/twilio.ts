import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Exact confirmation strings we registered with the carriers (CLAUDE.md SMS
// compliance). Do not reword.
export const STOP_CONFIRMATION =
  "You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.";
export const HELP_REPLY =
  "ReKnock quote follow-ups on behalf of your contractor. Reply STOP to unsubscribe. Msg & Data Rates May Apply.";

const STOP_WORDS = new Set(["STOP", "OPTOUT", "CANCEL", "END", "QUIT", "UNSUBSCRIBE", "REVOKE", "STOPALL"]);
const HELP_WORDS = new Set(["HELP", "INFO"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES"]);

export type KeywordType = "stop" | "help" | "start" | null;

// Carrier keyword detection: the message is just the keyword (case-insensitive).
export function keywordType(body: string): KeywordType {
  const w = body.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (STOP_WORDS.has(w)) return "stop";
  if (HELP_WORDS.has(w)) return "help";
  if (START_WORDS.has(w)) return "start";
  return null;
}

export type Window = { day_of_week: number; start_time: string; end_time: string; enabled: boolean };

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

// Can we send right now in the contact's local time? TCPA hard floor 8am-9pm,
// plus the company's configured window for that weekday.
export function canSendNow(tz: string, windows: Window[], now = new Date()): boolean {
  let weekday = now.getDay();
  let minutes = now.getHours() * 60 + now.getMinutes();
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    if (wd in map) weekday = map[wd];
    minutes = hh * 60 + mm;
  } catch {
    /* fall back to server local time */
  }
  if (minutes < 8 * 60 || minutes >= 21 * 60) return false; // TCPA floor
  const w = windows.find((x) => x.day_of_week === weekday);
  if (!w || !w.enabled) return false;
  return minutes >= minutesOfDay(w.start_time) && minutes <= minutesOfDay(w.end_time);
}

// Earliest instant at/after `after` that satisfies canSendNow. Scans in 15-min
// steps up to 14 days out; null when no window is enabled at all (caller
// defers a day and tries again: reschedule, never drop).
export function nextSendTime(tz: string, windows: Window[], after = new Date()): Date | null {
  const t = new Date(after);
  for (let i = 0; i < 14 * 24 * 4; i++) {
    if (canSendNow(tz, windows, t)) return new Date(t);
    t.setTime(t.getTime() + 15 * 60 * 1000);
  }
  return null;
}

// The tenant's own active number, if provisioned. Passed as From alongside the
// Messaging Service so every conversation stays on one number per company.
// Null (dev, or number still activating) lets the service pick the shared pool.
export async function companyFromNumber(companyId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("phone_numbers")
    .select("e164")
    .eq("company_id", companyId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return data?.e164 ?? null;
}

export type SendResult = { sent: boolean; skipped?: string };

// Low-level Twilio call. Throws on failure.
async function deliverViaTwilio(to: string, body: string, from?: string | null): Promise<string> {
  const sid = env.twilioAccountSid();
  const auth = Buffer.from(`${sid}:${env.twilioAuthToken()}`).toString("base64");
  const params = new URLSearchParams({
    MessagingServiceSid: env.twilioMessagingServiceSid(),
    To: to,
    Body: body,
  });
  if (from) params.set("From", from);
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const json = (await resp.json()) as { sid?: string; message?: string };
  if (!resp.ok || !json.sid) throw new Error(json.message ?? `Twilio ${resp.status}`);
  return json.sid;
}

// Send one SMS. Writes the messages-ledger row (with idempotency_key) BEFORE
// calling Twilio; a unique-violation means it already went out, so skip.
// Off production, refuses any recipient not in DEV_SMS_ALLOWLIST.
export async function sendSms(opts: {
  companyId: string;
  prospectId: string | null;
  to: string;
  body: string;
  idempotencyKey: string;
  sequenceStep?: number | null;
  kind?: "sequence" | "reminder" | "manual" | "relay" | "owner_ping" | "system";
  isRelay?: boolean;
}): Promise<SendResult> {
  const admin = createAdminClient();
  const isProd = process.env.VERCEL_ENV === "production";

  if (!isProd && !env.devSmsAllowlist().includes(opts.to)) {
    await admin.from("events").insert({
      company_id: opts.companyId,
      type: "sms_blocked_dev",
      payload: { to: opts.to, reason: "not in DEV_SMS_ALLOWLIST" },
    });
    return { sent: false, skipped: "dev_allowlist" };
  }

  // Ledger row first = the idempotency lock.
  const { error: insertErr } = await admin.from("messages").insert({
    company_id: opts.companyId,
    prospect_id: opts.prospectId,
    direction: "outbound",
    channel: "sms",
    body: opts.body,
    status: "queued",
    sequence_step: opts.sequenceStep ?? null,
    kind: opts.kind ?? (opts.isRelay ? "relay" : "manual"),
    idempotency_key: opts.idempotencyKey,
  });
  if (insertErr) {
    // 23505 = unique violation = already sent this exact touch/relay.
    if (insertErr.code === "23505") return { sent: false, skipped: "duplicate" };
    await admin.from("failed_jobs").insert({
      company_id: opts.companyId,
      job_type: "sms_ledger_insert",
      payload: { idempotency_key: opts.idempotencyKey },
      error: insertErr.message,
    });
    return { sent: false, skipped: "ledger_error" };
  }

  try {
    const from = await companyFromNumber(opts.companyId);
    const twilioSid = await deliverViaTwilio(opts.to, opts.body, from);
    await admin
      .from("messages")
      .update({ status: "sent", twilio_sid: twilioSid, sent_at: new Date().toISOString() })
      .eq("idempotency_key", opts.idempotencyKey);
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("messages").update({ status: "failed" }).eq("idempotency_key", opts.idempotencyKey);
    await admin.from("failed_jobs").insert({
      company_id: opts.companyId,
      job_type: "sms_send",
      payload: { to: opts.to, idempotency_key: opts.idempotencyKey },
      error: msg,
    });
    return { sent: false, skipped: "twilio_error" };
  }
}

// Send an already-claimed scheduled `messages` row (caller flipped it
// scheduled -> queued, which is the idempotency lock for scheduled sends).
// Fills in the drafted body, calls Twilio, records the terminal status.
export async function sendClaimedMessage(opts: {
  messageId: string;
  companyId: string;
  to: string;
  body: string;
}): Promise<SendResult> {
  const admin = createAdminClient();
  const isProd = process.env.VERCEL_ENV === "production";

  if (!isProd && !env.devSmsAllowlist().includes(opts.to)) {
    await admin
      .from("messages")
      .update({ status: "canceled", body: opts.body, send_meta: { reason: "dev_allowlist" } })
      .eq("id", opts.messageId);
    await admin.from("events").insert({
      company_id: opts.companyId,
      type: "sms_blocked_dev",
      payload: { to: opts.to, reason: "not in DEV_SMS_ALLOWLIST" },
    });
    return { sent: false, skipped: "dev_allowlist" };
  }

  try {
    const from = await companyFromNumber(opts.companyId);
    const twilioSid = await deliverViaTwilio(opts.to, opts.body, from);
    await admin
      .from("messages")
      .update({ status: "sent", body: opts.body, twilio_sid: twilioSid, sent_at: new Date().toISOString() })
      .eq("id", opts.messageId);
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("messages").update({ status: "failed", body: opts.body }).eq("id", opts.messageId);
    await admin.from("failed_jobs").insert({
      company_id: opts.companyId,
      job_type: "sms_send",
      payload: { to: opts.to, message_id: opts.messageId },
      error: msg,
    });
    return { sent: false, skipped: "twilio_error" };
  }
}
