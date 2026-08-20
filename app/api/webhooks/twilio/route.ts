import { type NextRequest } from "next/server";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { generateText, parseJson, AI_MODEL } from "@/lib/ai";
import { sendSms, keywordType, STOP_CONFIRMATION, HELP_REPLY, type SendResult } from "@/lib/twilio";
import { inngest } from "@/lib/inngest/client";
import { cancelScheduledForProspect, cancelPendingReminders } from "@/lib/enrollment";
import {
  buildReplyClassifierPrompt,
  buildSuggestedReplyPrompt,
  REPLY_CLASSIFIER_PROMPT_VERSION,
  SUGGESTED_REPLY_PROMPT_VERSION,
  type ReplyClassification,
  type ReplyIntent,
} from "@/lib/prompts/reply-classifier";
import { formatMoney } from "@/lib/format";
import { sendReplyNotificationEmail } from "@/lib/reply-email";

// "not until spring" / "call me in March" -> a concrete circle-back instant.
// Coarse on purpose: the proposal shows the date and the owner confirms it.
// Sends at that date go through the scheduled sender, which re-checks windows.
function hintToDate(hint: string): Date {
  const h = hint.toLowerCase();
  const now = new Date();
  const at = (month: number, day: number) => {
    const t = new Date(Date.UTC(now.getUTCFullYear(), month, day, 15));
    if (t.getTime() < now.getTime() + 86400_000) t.setUTCFullYear(t.getUTCFullYear() + 1);
    return t;
  };
  if (/spring/.test(h)) return at(2, 1);
  if (/summer/.test(h)) return at(5, 1);
  if (/fall|autumn/.test(h)) return at(8, 1);
  if (/winter/.test(h)) return at(11, 1);
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  for (let i = 0; i < 12; i++) {
    if (h.includes(months[i]) || new RegExp(`\\b${months[i].slice(0, 3)}\\b`).test(h)) return at(i, 1);
  }
  if (/next week|few days/.test(h)) return new Date(now.getTime() + 7 * 86400_000);
  if (/couple (of )?months|2 months/.test(h)) return new Date(now.getTime() + 60 * 86400_000);
  const parsed = new Date(hint);
  if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > now.getTime() && parsed.getTime() < now.getTime() + 366 * 86400_000) return parsed;
  return new Date(now.getTime() + 30 * 86400_000); // "later", unspecified
}

const prettyDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
// Relay messages must not fail silently (a contractor who never hears about a
// reply has no idea they missed a lead): a Twilio failure enqueues the Inngest
// retry function, which re-attempts with backoff and pages the admin if it
// never goes through.
async function retryIfFailed(res: SendResult, data: { idempotency_key: string; company_id: string; to: string; context: string }) {
  if (!res.sent && res.skipped === "twilio_error") {
    await inngest.send({ name: "sms/retry.requested", data });
  }
}

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
    .select("id, company_id, prospect_id, suggested_kind, suggested_body, suggested_meta")
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

      // Level 2 acceptance: a bare "1" takes the pending proposal on this
      // session. That text IS the human action the compliance invariant needs.
      const accepts = text.trim() === "1" && !!session.suggested_kind;
      const clearSuggestion = () =>
        admin.from("relay_sessions").update({ suggested_kind: null, suggested_body: null, suggested_meta: null }).eq("id", session.id);

      if (accepts && session.suggested_kind === "reminder") {
        const remindAt = new Date(String((session.suggested_meta as { remind_at?: string } | null)?.remind_at ?? ""));
        if (!Number.isNaN(remindAt.getTime()) && remindAt.getTime() > Date.now()) {
          const { data: rem } = await admin
            .from("reminders")
            .insert({
              company_id: session.company_id,
              prospect_id: target.id,
              remind_at: remindAt.toISOString(),
              mode: "auto_send",
              note: "Homeowner asked to circle back later (accepted from the relay ping)",
            })
            .select("id")
            .single();
          if (rem) {
            const { data: msg } = await admin
              .from("messages")
              .insert({
                company_id: session.company_id,
                prospect_id: target.id,
                direction: "outbound",
                channel: "sms",
                kind: "reminder",
                status: "scheduled",
                scheduled_for: remindAt.toISOString(),
                idempotency_key: `reminder:${rem.id}`,
              })
              .select("id")
              .single();
            if (msg) await admin.from("reminders").update({ message_id: msg.id }).eq("id", rem.id);
            await clearSuggestion();
            await admin.from("events").insert({
              company_id: session.company_id,
              type: "agent.reminder_accepted",
              payload: { prospect_id: target.id, remind_at: remindAt.toISOString() },
            });
            await sendSms({
              companyId: session.company_id,
              prospectId: null,
              to: from,
              body: `Done. We will circle back with ${target.first_name ?? "them"} on ${prettyDay(remindAt)} in your voice. It is on their timeline in ReKnock if you want to change anything.`,
              idempotencyKey: `reminder-ack:${messageSid || rem.id}`,
              kind: "owner_ping",
              isRelay: true,
            });
            return TWIML_OK;
          }
        }
        // Anything failed: fall through and forward the literal text.
      }

      const sendingSuggestion = accepts && session.suggested_kind === "reply" && !!session.suggested_body;
      const outText = sendingSuggestion ? (session.suggested_body as string) : text;

      // Owner-initiated, so quiet hours do not apply (it is their lead).
      const relayOutKey = `relay-out:${messageSid || crypto.randomUUID()}`;
      const relayOutRes = await sendSms({
        companyId: session.company_id,
        prospectId: target.id,
        to: target.phone_e164,
        body: outText,
        idempotencyKey: relayOutKey,
        kind: "relay",
        isRelay: true,
      });
      await retryIfFailed(relayOutRes, { idempotency_key: relayOutKey, company_id: session.company_id, to: target.phone_e164, context: "relay_to_homeowner" });
      await admin.from("relay_sessions").update({ expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() }).eq("id", session.id);
      if (session.suggested_kind) {
        // Accept/replace telemetry: the flywheel that measures draft quality.
        await clearSuggestion();
        await admin.from("events").insert({
          company_id: session.company_id,
          type: sendingSuggestion ? "agent.suggestion_sent" : "agent.suggestion_replaced",
          payload: { prospect_id: target.id, kind: session.suggested_kind },
        });
      }
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
      const alreadyOptedOut = OPT_OUT_STATUSES.has(prospect.status);
      const ids = (matches ?? []).map((m) => m.id);
      await admin.from("prospects").update({ status: "opted_out" }).eq("company_id", companyId).eq("phone_e164", from);
      // Name the prospect on the ledger so the in-app notification can say who.
      await admin.from("events").insert({ company_id: companyId, type: "opt_out", payload: { prospect_id: prospect.id, phone: from, source: "sms_stop" } });
      for (const id of ids) {
        await cancelScheduledForProspect(id, "opt_out", ["sequence", "reminder"]);
        await cancelPendingReminders(id, "opt_out");
      }
      // One confirmation to the homeowner (idempotent).
      await sendSms({
        companyId,
        prospectId: prospect.id,
        to: from,
        body: STOP_CONFIRMATION,
        idempotencyKey: `optout-confirm:${messageSid || from}`,
        kind: "system",
      });
      // Tell the contractor why the sequence went quiet - a distinct one-way
      // ping (no relay session; they can't text an opted-out homeowner). Only
      // on the FIRST stop, so repeat STOPs don't re-ping. Owner notification,
      // so it is exempt from the STOP-line append (kind owner_ping).
      if (!alreadyOptedOut) {
        const { data: owner } = await admin.from("users").select("cell_phone").eq("company_id", companyId).not("cell_phone", "is", null).limit(1).maybeSingle();
        if (owner?.cell_phone) {
          const name = prospect.first_name ?? "A customer";
          const key = `optout-owner:${messageSid || prospect.id}`;
          const res = await sendSms({
            companyId,
            prospectId: prospect.id,
            to: owner.cell_phone,
            body: `${name} (${from}) replied STOP, so they've opted out of your texts. Their follow-ups are stopped and we won't text them again unless they message you first.`,
            idempotencyKey: key,
            kind: "owner_ping",
          });
          await retryIfFailed(res, { idempotency_key: key, company_id: companyId, to: owner.cell_phone, context: "optout_owner_ping" });
        }
      }
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

  // Re-engagement: a homeowner who previously opted out has texted this
  // contractor again (this is not STOP/START/HELP - those returned above). An
  // AFFIRMATIVE inbound (a real question or interest) counts as them
  // re-initiating contact, which lifts the opt-out for THIS contractor so the
  // contractor can respond. The automated sequence is NOT auto-resumed. A
  // negative or opt-out-style message keeps them suppressed. This is the one
  // path that re-opens contact with an opted-out number, so it is
  // classifier-gated (a bare "any inbound lifts it" rule would wrongly
  // re-subscribe someone texting "leave me alone").
  //
  // >>> COMPLIANCE-SENSITIVE - PENDING LEGAL REVIEW (same review as /sms-terms)
  // before A2P resubmit / production. Ships on dev for review; the founder's
  // dev->main merge gates it. Easily reverted (delete this block). <<<
  if (prospect && companyId && OPT_OUT_STATUSES.has(prospect.status)) {
    let intent: ReplyIntent | null = null;
    let confidence = 0;
    try {
      const { system, prompt, temperature, maxTokens } = buildReplyClassifierPrompt(body, prospect.first_name ?? undefined);
      const { text } = await generateText({ system, prompt, temperature, maxTokens });
      const c = parseJson<ReplyClassification>(text);
      if (c) { intent = c.intent; confidence = c.confidence; }
    } catch {
      /* best-effort; if we can't classify, stay suppressed (fail closed) */
    }
    const affirmative = intent != null && confidence >= 0.5 && ["interested", "question", "reschedule"].includes(intent);
    if (affirmative) {
      // Lift suppression for this (company, phone), scoped exactly like STOP.
      await admin.from("prospects").update({ status: "paused" }).eq("company_id", companyId).eq("phone_e164", from).in("status", [...OPT_OUT_STATUSES]);
      await admin.from("events").insert({ company_id: companyId, type: "re_engaged", payload: { prospect_id: prospect.id, phone: from, intent, confidence } });
      prospect.status = "paused"; // let the reply branch below run + relay to the owner
    } else {
      // Stay suppressed. Log for audit; do not re-open or ping (mirrors today's
      // silent handling of opted-out inbounds, but now recorded).
      await admin.from("events").insert({ company_id: companyId, type: "re_engagement_held", payload: { prospect_id: prospect.id, phone: from, intent, confidence } });
      return TWIML_OK;
    }
  }

  // A real reply. Freeze is DB-atomic: status flip + canceling the scheduled
  // rows happen right here, so a touch job that fires mid-reply finds either
  // a canceled row or a replied prospect (both checked again at claim time).
  if (prospect && companyId && !OPT_OUT_STATUSES.has(prospect.status)) {
    await admin.from("prospects").update({ status: "replied" }).eq("id", prospect.id);
    await cancelScheduledForProspect(prospect.id, "replied");
    await admin.from("events").insert({ company_id: companyId, type: "reply_received", payload: { prospect_id: prospect.id } });

    // Classify (stored for the eval set + to suggest a contractor action). Never auto-replies the homeowner.
    let classification: ReplyClassification | null = null;
    try {
      const { system, prompt, temperature, maxTokens } = buildReplyClassifierPrompt(body, prospect.first_name ?? undefined);
      const { text, usage } = await generateText({ system, prompt, temperature, maxTokens });
      classification = parseJson<ReplyClassification>(text);
      if (classification) {
        await admin
          .from("messages")
          .update({ ai_classification: { ...classification, prompt_version: REPLY_CLASSIFIER_PROMPT_VERSION } })
          .eq("twilio_sid", messageSid);
        await admin.from("events").insert({
          company_id: companyId,
          type: "ai.reply_classified",
          payload: { model: AI_MODEL, prompt_version: REPLY_CLASSIFIER_PROMPT_VERSION, intent: classification.intent, confidence: classification.confidence, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
        });
      }
    } catch {
      /* classification is best-effort; the freeze already happened */
    }

    // Level 2 agent: turn the ping into a proposal the owner accepts with "1".
    // Drafts never reach the homeowner without that human action.
    let proposal: { kind: "reply" | "reminder"; body: string | null; meta: Record<string, unknown> | null; pingLine: string } | null = null;
    try {
      if (classification && (classification.intent === "question" || classification.intent === "interested") && classification.confidence >= 0.5) {
        const [{ data: voice }, { data: pd }] = await Promise.all([
          admin.from("voice_profiles").select("master_prompt").eq("company_id", companyId).eq("is_latest", true).maybeSingle(),
          admin.from("prospects").select("job_type, quote_amount").eq("id", prospect.id).maybeSingle(),
        ]);
        if (voice?.master_prompt) {
          const { system, prompt, temperature, maxTokens } = buildSuggestedReplyPrompt(voice.master_prompt, {
            firstName: prospect.first_name ?? "there",
            jobType: pd?.job_type ?? null,
            quoteAmount: formatMoney(pd?.quote_amount),
            homeownerMessage: body,
          });
          const { text } = await generateText({ system, prompt, temperature, maxTokens });
          let draft = text.trim().replace(/^["']|["']$/g, "").replace(/—/g, " ").replace(/https?:\/\/\S+/gi, "").trim();
          if (draft.length > 300) draft = draft.slice(0, 297).trimEnd() + "...";
          if (draft) {
            proposal = { kind: "reply", body: draft, meta: null, pingLine: ` Suggested reply: "${draft}" Text 1 to send it, or reply with your own words.` };
          }
        }
      } else if (classification?.intent === "reschedule") {
        const when = hintToDate(classification.reschedule_hint ?? "");
        proposal = {
          kind: "reminder",
          body: null,
          meta: { remind_at: when.toISOString() },
          pingLine: ` Sounds like later. Text 1 and we will circle back ${prettyDay(when)} with a check-in in your voice, or reply with your own words to send now.`,
        };
      }
      if (proposal) {
        await admin.from("events").insert({
          company_id: companyId,
          type: "agent.suggestion_offered",
          payload: { prospect_id: prospect.id, kind: proposal.kind, intent: classification?.intent, prompt_version: SUGGESTED_REPLY_PROMPT_VERSION },
        });
      }
    } catch {
      /* the proposal is a bonus; the plain relay ping still goes out */
    }

    // Email-first takeover: the contractor gets a clean email notification
    // with Reply-To: reply+token@getreknock.com. Hitting reply routes their
    // email back to this homeowner as an SMS. The older SMS relay branch above
    // remains for legacy open relay sessions, but new replies default to email
    // + in-app.
    const name = prospect.first_name ?? "A customer";
    const emailRes = await sendReplyNotificationEmail({
      companyId,
      prospectId: prospect.id,
      homeownerName: name,
      homeownerPhone: from,
      homeownerMessage: body,
    });
    if (!emailRes.sent) {
      await admin.from("failed_jobs").insert({
        company_id: companyId,
        job_type: "reply_email_notification",
        payload: { prospect_id: prospect.id, skipped: emailRes.skipped },
        error: "Could not send reply notification email",
      });
    }
  }

  return TWIML_OK;
}
