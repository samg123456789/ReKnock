import { type NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { inngest } from "@/lib/inngest/client";
import { generateText, parseJson, AI_MODEL } from "@/lib/ai";
import { sendSms, keywordType, STOP_CONFIRMATION, HELP_REPLY } from "@/lib/twilio";
import {
  buildReplyClassifierPrompt,
  REPLY_CLASSIFIER_PROMPT_VERSION,
  type ReplyClassification,
} from "@/lib/prompts/reply-classifier";

const OPT_OUT_STATUSES = new Set(["opted_out"]);
const TWIML_OK = new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
  status: 200,
  headers: { "content-type": "text/xml" },
});

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

  // Reconstruct the exact URL Twilio signed (the configured webhook URL).
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const url = `${proto}://${host}/api/webhooks/twilio`;
  const signature = request.headers.get("x-twilio-signature") ?? "";

  if (!verifySignature(env.twilioAuthToken(), url, params, signature)) {
    return new Response("invalid signature", { status: 403 });
  }

  const from = params.From ?? "";
  const body = (params.Body ?? "").trim();
  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  if (!from) return TWIML_OK;

  const admin = createAdminClient();

  // Find the prospect(s) on this phone. Single tenant for now; scope by phone.
  const { data: matches } = await admin
    .from("prospects")
    .select("id, company_id, first_name, phone_e164, status")
    .eq("phone_e164", from)
    .order("created_at", { ascending: false });
  const prospect = matches?.[0] ?? null;
  const companyId = prospect?.company_id ?? null;

  // Persist the raw inbound (append-only ledger).
  await admin.from("messages").insert({
    company_id: companyId,
    prospect_id: prospect?.id ?? null,
    direction: "inbound",
    channel: "sms",
    body,
    twilio_sid: messageSid || null,
    status: "received",
  });

  const kw = keywordType(body);

  // STOP: suppress ALL of this company's prospects on this phone, forever.
  if (kw === "stop") {
    if (companyId) {
      const ids = (matches ?? []).map((m) => m.id);
      await admin.from("prospects").update({ status: "opted_out" }).eq("company_id", companyId).eq("phone_e164", from);
      await admin.from("events").insert({ company_id: companyId, type: "opt_out", payload: { phone: from, source: "sms_stop" } });
      // Freeze every sequence for this phone.
      for (const id of ids) {
        await inngest.send({ name: "prospect/opted_out", data: { company_id: companyId, prospect_id: id } });
      }
      // One confirmation (idempotent).
      await sendSms({
        companyId,
        prospectId: prospect?.id ?? null,
        to: from,
        body: STOP_CONFIRMATION,
        idempotencyKey: `optout-confirm:${messageSid || from}`,
      });
    }
    return TWIML_OK;
  }

  if (kw === "help") {
    if (companyId) {
      await sendSms({ companyId, prospectId: prospect?.id ?? null, to: from, body: HELP_REPLY, idempotencyKey: `help:${messageSid || from}` });
    }
    return TWIML_OK;
  }

  if (kw === "start") {
    // Resubscribe: lift opt-out. Do not auto-restart a sequence.
    if (companyId) {
      await admin.from("prospects").update({ status: "paused" }).eq("company_id", companyId).eq("phone_e164", from).in("status", [...OPT_OUT_STATUSES]);
      await admin.from("events").insert({ company_id: companyId, type: "resubscribe", payload: { phone: from } });
    }
    return TWIML_OK;
  }

  // A real reply. Freeze the sequence (atomic) and flag for the contractor.
  if (prospect && companyId && !OPT_OUT_STATUSES.has(prospect.status)) {
    await admin.from("prospects").update({ status: "replied" }).eq("id", prospect.id);
    await admin.from("events").insert({ company_id: companyId, type: "reply_received", payload: { prospect_id: prospect.id } });
    await inngest.send({ name: "prospect/replied", data: { company_id: companyId, prospect_id: prospect.id } });

    // Classify (stored for the eval set + to suggest a contractor action). Never auto-replies the homeowner.
    try {
      const { system, prompt, temperature, maxTokens } = buildReplyClassifierPrompt(body, prospect.first_name ?? undefined);
      const { text, usage } = await generateText({ system, prompt, temperature, maxTokens });
      const parsed = parseJson<ReplyClassification>(text);
      if (parsed) {
        await admin
          .from("messages")
          .update({ ai_classification: { ...parsed, prompt_version: REPLY_CLASSIFIER_PROMPT_VERSION } })
          .eq("twilio_sid", messageSid);
        await admin.from("events").insert({
          company_id: companyId,
          type: "ai.reply_classified",
          payload: { model: AI_MODEL, prompt_version: REPLY_CLASSIFIER_PROMPT_VERSION, intent: parsed.intent, confidence: parsed.confidence, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
        });
      }
    } catch {
      /* classification is best-effort; the freeze already happened */
    }

    // Relay to the contractor's cell (quiet-hours exempt). Requires a captured cell.
    const { data: owner } = await admin.from("users").select("cell_phone").eq("company_id", companyId).not("cell_phone", "is", null).limit(1).maybeSingle();
    if (owner?.cell_phone) {
      const name = prospect.first_name ?? "Your lead";
      await sendSms({
        companyId,
        prospectId: prospect.id,
        to: owner.cell_phone,
        body: `${name} replied to your follow-up: "${body}". Reply here and we will pass it on, or call them at ${from}.`,
        idempotencyKey: `relay:${messageSid || prospect.id}`,
        isRelay: true,
      });
    }
  }

  return TWIML_OK;
}
