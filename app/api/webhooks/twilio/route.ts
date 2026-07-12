import { type NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { generateText, parseJson, AI_MODEL } from "@/lib/ai";
import { sendSms, keywordType, STOP_CONFIRMATION, HELP_REPLY } from "@/lib/twilio";
import { cancelScheduledForProspect, cancelPendingReminders } from "@/lib/enrollment";
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

// Owner relay replies may start with "1)" / "2)" to pick between open chats
// (1 = newest). Returns the 1-based pick and the message without the prefix.
function parseRelayPrefix(body: string): { pick: number | null; text: string } {
  const m = body.match(/^\s*(\d)\s*[).:-]\s*([\s\S]*)$/);
  if (m && m[2].trim()) return { pick: Number(m[1]), text: m[2].trim() };
  return { pick: null, text: body };
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
  const to = params.To ?? "";
  const body = (params.Body ?? "").trim();
  const messageSid = params.MessageSid ?? params.SmsSid ?? "";
  if (!from) return TWIML_OK;

  const admin = createAdminClient();

  // Tenant routing: the To number is the tenant's dedicated line. Numbers are
  // unique across the platform, so this pins the company. Numbers not in
  // phone_numbers (the shared dev/founder line) fall back to From matching.
  let toCompanyId: string | null = null;
  if (to) {
    const { data: line } = await admin
      .from("phone_numbers")
      .select("company_id")
      .eq("e164", to)
      .maybeSingle();
    toCompanyId = line?.company_id ?? null;
  }

  // Owner relay-back: the contractor replying to a relay/reminder ping. Only
  // treated as such while a relay session is open (sessions expire after 24h),
  // so a contractor's own number can still act as a test prospect otherwise.
  const nowIso = new Date().toISOString();
  let sessionQuery = admin
    .from("relay_sessions")
    .select("id, company_id, prospect_id")
    .eq("owner_phone", from)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .limit(9);
  if (toCompanyId) sessionQuery = sessionQuery.eq("company_id", toCompanyId);
  const { data: sessions } = await sessionQuery;

  if (sessions?.length) {
    const { data: ownerUser } = await admin
      .from("users")
      .select("id, company_id")
      .eq("cell_phone", from)
      .eq("company_id", sessions[0].company_id)
      .limit(1)
      .maybeSingle();
    if (ownerUser) {
      const { pick, text } = parseRelayPrefix(body);
      const session = sessions[Math.min(Math.max((pick ?? 1) - 1, 0), sessions.length - 1)];
      const { data: target } = await admin
        .from("prospects")
        .select("id, first_name, phone_e164, status")
        .eq("id", session.prospect_id)
        .maybeSingle();

      // Ledger the owner's inbound (no prospect_id: the forwarded outbound is
      // what belongs in the homeowner thread).
      await admin.from("messages").insert({
        company_id: session.company_id,
        prospect_id: null,
        direction: "inbound",
        channel: "sms",
        body,
        twilio_sid: messageSid || null,
        status: "received",
        kind: "relay",
      });

      if (!target?.phone_e164 || OPT_OUT_STATUSES.has(target.status)) {
        await sendSms({
          companyId: session.company_id,
          prospectId: null,
          to: from,
          body: target ? `${target.first_name ?? "That lead"} opted out of texts, so we cannot deliver that. Give them a call instead.` : "We could not find that lead anymore. Open your ReKnock inbox to follow up.",
          idempotencyKey: `relay-fail:${messageSid || crypto.randomUUID()}`,
          kind: "owner_ping",
          isRelay: true,
        });
        return TWIML_OK;
      }

      // Owner-initiated, so quiet hours do not apply (it is their lead).
      await sendSms({
        companyId: session.company_id,
        prospectId: target.id,
        to: target.phone_e164,
        body: text,
        idempotencyKey: `relay-out:${messageSid || crypto.randomUUID()}`,
        kind: "relay",
        isRelay: true,
      });
      await admin.from("relay_sessions").update({ expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() }).eq("id", session.id);
      await admin.from("events").insert({
        company_id: session.company_id,
        type: "relay_forwarded",
        payload: { prospect_id: target.id },
      });
      return TWIML_OK;
    }
  }

  // Homeowner path: match the prospect, company-scoped when the To number
  // pinned a tenant, cross-tenant (newest wins) on the shared line.
  let prospectQuery = admin
    .from("prospects")
    .select("id, company_id, first_name, phone_e164, status")
    .eq("phone_e164", from)
    .order("created_at", { ascending: false });
  if (toCompanyId) prospectQuery = prospectQuery.eq("company_id", toCompanyId);
  const { data: matches } = await prospectQuery;
  const prospect = matches?.[0] ?? null;
  const companyId = prospect?.company_id ?? toCompanyId;

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
  // Kills pending scheduled sends and reminders too.
  if (kw === "stop") {
    if (prospect && companyId) {
      const ids = (matches ?? []).map((m) => m.id);
      await admin.from("prospects").update({ status: "opted_out" }).eq("company_id", companyId).eq("phone_e164", from);
      await admin.from("events").insert({ company_id: companyId, type: "opt_out", payload: { phone: from, source: "sms_stop" } });
      for (const id of ids) {
        await cancelScheduledForProspect(id, "opt_out", ["sequence", "reminder"]);
        await cancelPendingReminders(id, "opt_out");
      }
      // One confirmation (idempotent).
      await sendSms({
        companyId,
        prospectId: prospect.id,
        to: from,
        body: STOP_CONFIRMATION,
        idempotencyKey: `optout-confirm:${messageSid || from}`,
        kind: "system",
      });
    }
    return TWIML_OK;
  }

  if (kw === "help") {
    if (companyId) {
      await sendSms({
        companyId,
        prospectId: prospect?.id ?? null,
        to: from,
        body: HELP_REPLY,
        idempotencyKey: `help:${messageSid || from}`,
        kind: "system",
      });
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

  // A real reply. Freeze is DB-atomic: status flip + canceling the scheduled
  // rows happen right here, so a touch job that fires mid-reply finds either
  // a canceled row or a replied prospect (both checked again at claim time).
  if (prospect && companyId && !OPT_OUT_STATUSES.has(prospect.status)) {
    await admin.from("prospects").update({ status: "replied" }).eq("id", prospect.id);
    await cancelScheduledForProspect(prospect.id, "replied");
    await admin.from("events").insert({ company_id: companyId, type: "reply_received", payload: { prospect_id: prospect.id } });

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

    // Relay to the contractor's cell (quiet-hours exempt) and open a relay
    // session so their reply routes back to this homeowner.
    const { data: owner } = await admin.from("users").select("cell_phone").eq("company_id", companyId).not("cell_phone", "is", null).limit(1).maybeSingle();
    if (owner?.cell_phone) {
      const { count: openCount } = await admin
        .from("relay_sessions")
        .select("id", { count: "exact", head: true })
        .eq("owner_phone", owner.cell_phone)
        .eq("company_id", companyId)
        .gt("expires_at", nowIso);
      const name = prospect.first_name ?? "Your lead";
      const multi = (openCount ?? 0) > 0 ? ` You have ${(openCount ?? 0) + 1} open chats. Start your reply with "1)" for this one.` : "";
      const res = await sendSms({
        companyId,
        prospectId: prospect.id,
        to: owner.cell_phone,
        body: `${name} replied to your follow-up: "${body}". Reply here and we will pass it on, or call them at ${from}.${multi}`,
        idempotencyKey: `relay:${messageSid || prospect.id}`,
        kind: "owner_ping",
        isRelay: true,
      });
      if (res.sent) {
        await admin.from("relay_sessions").insert({
          company_id: companyId,
          prospect_id: prospect.id,
          owner_phone: owner.cell_phone,
        });
      }
    }
  }

  return TWIML_OK;
}
