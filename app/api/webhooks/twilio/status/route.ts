import { type NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

// Twilio delivery-status callbacks (StatusCallback set per message in
// lib/twilio.ts). Lands the carrier verdict on the ledger row: 'delivered',
// or 'failed' with the error code in send_meta (30007 = carrier filtering,
// 30003/30005/30006 = unreachable handset, 30034 = unregistered number).
// This is the deliverability health signal; query it, no dashboard needed:
//   select send_meta->>'delivery_error_code' as code, count(*)
//   from messages where status='failed' and send_meta ? 'delivery_error_code'
//   group by 1 order by 2 desc;

function verifySignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const url = `${proto}://${host}/api/webhooks/twilio/status`;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!verifySignature(env.twilioAuthToken(), url, params, signature)) {
    return new Response("invalid signature", { status: 403 });
  }

  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  const status = params.MessageStatus ?? "";
  const errorCode = params.ErrorCode ?? null;
  if (!messageSid) return new Response("ok", { status: 200 });

  // Only terminal verdicts matter for the ledger; intermediate queued/sending
  // callbacks are noise. Append-only: forward transitions only (sent ->
  // delivered, sent -> failed), never delivered -> anything.
  if (status !== "delivered" && status !== "undelivered" && status !== "failed") {
    return new Response("ok", { status: 200 });
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("messages")
    .select("id, status, send_meta, company_id")
    .eq("twilio_sid", messageSid)
    .maybeSingle();
  if (!row || row.status === "delivered") return new Response("ok", { status: 200 });

  const meta = { ...((row.send_meta as Record<string, unknown> | null) ?? {}), delivery_status: status };
  if (errorCode) (meta as Record<string, unknown>).delivery_error_code = errorCode;
  await admin
    .from("messages")
    .update({ status: status === "delivered" ? "delivered" : "failed", send_meta: meta })
    .eq("id", row.id)
    .eq("status", row.status);

  // Carrier filtering is the trust-score red flag; make it visible in events
  // so a spike is queryable without joining the ledger.
  if (errorCode === "30007") {
    await admin.from("events").insert({
      company_id: row.company_id,
      type: "delivery_filtered",
      payload: { twilio_sid: messageSid, error_code: errorCode },
    });
  }
  return new Response("ok", { status: 200 });
}
