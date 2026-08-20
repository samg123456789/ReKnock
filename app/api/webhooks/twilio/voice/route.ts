import { type NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

const EMPTY_TWIML = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
  status: 200,
  headers: { "content-type": "text/xml" },
});

const MISSED_DIAL_STATUSES = new Set(["busy", "no-answer", "failed", "canceled"]);

function verifySignature(authToken: string, url: string, params: Record<string, string>, signature: string): boolean {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function isLikelyE164(value: string | null | undefined): value is string {
  return /^\+[1-9]\d{6,14}$/.test(value ?? "");
}

function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    status: 200,
    headers: { "content-type": "text/xml" },
  });
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const url = `${proto}://${host}/api/webhooks/twilio/voice`;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!verifySignature(env.twilioAuthToken(), url, params, signature)) {
    return new Response("invalid signature", { status: 403 });
  }

  const admin = createAdminClient();
  const callSid = params.CallSid ?? "";
  const from = params.From ?? "";
  const to = params.To ?? "";
  const dialStatus = params.DialCallStatus ?? "";

  if (dialStatus) {
    const { data: line } = to
      ? await admin.from("phone_numbers").select("company_id").eq("e164", to).neq("status", "released").maybeSingle()
      : { data: null };
    const companyId = line?.company_id ?? null;
    const payload = {
      call_sid: callSid || null,
      dial_call_sid: params.DialCallSid ?? null,
      from,
      to,
      dial_status: dialStatus,
    };

    await admin.from("events").insert({
      company_id: companyId,
      type: MISSED_DIAL_STATUSES.has(dialStatus) ? "incoming_call_missed" : "incoming_call_completed",
      payload,
    });

    if (MISSED_DIAL_STATUSES.has(dialStatus)) {
      await admin.from("failed_jobs").insert({
        company_id: companyId,
        job_type: "voice_forwarding",
        payload,
        error: `Inbound call ended with DialCallStatus=${dialStatus}`,
      });
    }

    return EMPTY_TWIML;
  }

  const sharedNumbers = new Set(
    (process.env.TWILIO_SHARED_NUMBERS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const { data: line } = to
    ? await admin
        .from("phone_numbers")
        .select("company_id")
        .eq("e164", to)
        .neq("status", "released")
        .maybeSingle()
    : { data: null };

  const companyId = line?.company_id ?? null;
  const isSharedLine = Boolean(to && sharedNumbers.has(to));

  const ownerQuery = companyId
    ? admin
        .from("users")
        .select("id, cell_phone")
        .eq("company_id", companyId)
        .not("cell_phone", "is", null)
        .not("cell_phone_verified_at", "is", null)
        .limit(1)
        .maybeSingle()
    : isSharedLine
      ? admin
          .from("users")
          .select("id, cell_phone")
          .eq("platform_admin", true)
          .not("cell_phone", "is", null)
          .not("cell_phone_verified_at", "is", null)
          .limit(1)
          .maybeSingle()
      : null;
  const { data: owner } = ownerQuery ? await ownerQuery : { data: null };

  const basePayload = {
    call_sid: callSid || null,
    from,
    to,
    shared_line: isSharedLine,
    route: companyId ? "company_number" : isSharedLine ? "shared_platform_admin" : "unmatched_number",
  };

  if (!owner || !isLikelyE164(owner.cell_phone)) {
    await admin.from("events").insert({
      company_id: companyId,
      type: "incoming_call_unrouted",
      payload: { ...basePayload, reason: companyId || isSharedLine ? "no_verified_owner_phone" : "unknown_twilio_number" },
    });
    await admin.from("failed_jobs").insert({
      company_id: companyId,
      job_type: "voice_forwarding",
      payload: basePayload,
      error: companyId || isSharedLine
        ? "No verified owner phone available for inbound Twilio voice call"
        : "Inbound Twilio voice call came to an unknown ReKnock number",
    });
    return twiml("<Say>We could not connect your call. Please text this number and we will follow up.</Say>");
  }

  await admin.from("events").insert({
    company_id: companyId,
    type: "incoming_call_forwarded",
    payload: { ...basePayload, owner_user_id: owner.id },
  });

  const action = xmlEscape(url);
  const ownerPhone = xmlEscape(owner.cell_phone);
  return twiml(
    `<Dial timeout="20" answerOnBridge="true" action="${action}" method="POST"><Number>${ownerPhone}</Number></Dial>`,
  );
}
