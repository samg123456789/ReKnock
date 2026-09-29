import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const REPLY_LOCAL_PREFIX = "reply+";
const NOTIFY_FROM = "ReKnock <notifications@getreknock.com>";

export function extractReplyToken(address: string | null | undefined): string | null {
  const email = (address ?? "").toLowerCase();
  const match = email.match(/reply\+([a-z0-9_-]+)@getreknock\.com/);
  return match?.[1] ?? null;
}

export function stripQuotedEmail(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .split(/\nOn .+ wrote:\n/i)[0]
    .split(/\n-{2,}\s*Original Message\s*-{2,}/i)[0]
    .split(/\nFrom:\s.+\nSent:\s.+/i)[0]
    .split(/\n> /)[0]
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendReplyNotificationEmail(opts: {
  companyId: string;
  prospectId: string;
  homeownerName: string;
  homeownerPhone: string;
  homeownerMessage: string;
}) {
  const admin = createAdminClient();
  const [{ data: owners }, { data: prospect }] = await Promise.all([
    admin
      .from("users")
      .select("email, full_name, notification_preferences")
      .eq("company_id", opts.companyId)
      .not("email", "is", null)
      .limit(100),
    admin
      .from("prospects")
      .select("job_type, quote_amount")
      .eq("id", opts.prospectId)
      .maybeSingle(),
  ]);

  const recipients = (owners ?? []).filter((owner) => {
    const prefs = (owner.notification_preferences as { replies?: boolean } | null) ?? {};
    return prefs.replies !== false && Boolean(owner.email);
  });
  if (!recipients.length || !process.env.RESEND_API_KEY) return { sent: false, skipped: "missing_email" };

  const appUrl = env.appUrl();
  const threadUrl = `${appUrl}/inbox?p=${opts.prospectId}`;
  const jobLine = prospect?.job_type ? `\nJob: ${prospect.job_type}` : "";
  const subject = `${opts.homeownerName} replied to your ReKnock follow-up`;
  const text = [
    `${opts.homeownerName} replied to your ReKnock follow-up:`,
    "",
    `"${opts.homeownerMessage}"`,
    "",
    `Phone: ${opts.homeownerPhone}${jobLine}`,
    "",
    "Reply to this email and ReKnock will send your reply as a text from your ReKnock number.",
    `Or open the thread in ReKnock: ${threadUrl}`,
    "",
    "Keep it short and direct. We add the required opt-out line automatically when needed.",
  ].join("\n");

  let sent = 0;
  for (const owner of recipients) {
    const token = crypto.randomBytes(12).toString("base64url").toLowerCase();
    const { error } = await admin.from("email_reply_sessions").insert({ company_id: opts.companyId, prospect_id: opts.prospectId, owner_email: owner.email!.toLowerCase(), token });
    if (error) continue;
    const replyTo = `${REPLY_LOCAL_PREFIX}${token}@getreknock.com`;
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: NOTIFY_FROM, to: [owner.email], reply_to: `ReKnock Reply <${replyTo}>`, subject, text }),
    });
    if (resp.ok) sent += 1;
  }
  if (!sent) return { sent: false, skipped: "resend_failed" };

  await admin.from("events").insert({
    company_id: opts.companyId,
    type: "reply_email_notification_sent",
    payload: { prospect_id: opts.prospectId },
  });
  return { sent: true, recipients: sent };
}
