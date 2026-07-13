import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/server";
import { generateText, parseJson } from "@/lib/ai";
import { buildFollowupDrafterPrompt, enforceCompliance, fillTemplate } from "@/lib/prompts/followup-drafter";
import { buildQuoteExtractorPrompt, type QuoteExtraction } from "@/lib/prompts/quote-extractor";
import { sendSms, sendClaimedMessage, retrySmsTo, canSendNow, nextSendTime, type Window } from "@/lib/twilio";
import { notifyAdmin } from "@/lib/notify-admin";
import { env } from "@/lib/env";
import { bareEmail, INTAKE_EMAIL } from "@/lib/intake-email";
import { ONBOARDING_DRIP, DRIP_FROM } from "@/lib/emails/onboarding-drip";
import { normalizePhone as normalizeIntakePhone } from "@/lib/phone";
import { computeStartAt, scheduleSequence } from "@/lib/enrollment";
import { DEFAULT_CAMPAIGN_STEPS, type CampaignStep } from "@/lib/campaign";

// Scheduled-send engine. Every future send is a `messages` row with
// status='scheduled'; the dispatcher cron finds due rows and fans out one
// event per send. All safety checks (status/opt-out/cap/window/override) run
// at SEND time, so a STOP or a reply between scheduling and firing always
// wins. Freezing = flipping rows to 'canceled' in the DB (done directly by
// the webhook/actions, no event round-trip), which is atomic with the
// prospect status update issued alongside it.

const STOP_STATUSES = new Set(["replied", "opted_out", "won", "lost", "paused"]);
const TRIAL_CAP = 50;
const TRIAL_WARN = 40;
const BATCH = 50;
// Hard floor between automated sends to the same homeowner, regardless of how
// the contractor arranges their timeline (equal day offsets, stacked manual
// touches). Not configurable. Prod only: dev test sequences run minutes apart.
const MIN_GAP_MS = 2 * 3600_000;
// Small random spread so sends stacked on the same window-open instant do not
// leave as one burst (carriers penalize bursts of similar content).
const jitterMs = (maxMinutes: number) => Math.floor(Math.random() * maxMinutes * 60_000);

function isProd(): boolean {
  return process.env.VERCEL_ENV === "production";
}

// Every minute: fire due scheduled messages + due "remind me" pings.
// Duplicate fan-out is harmless: the sender's atomic claim (scheduled ->
// queued) makes the second event a no-op.
export const scheduledSendDispatcher = inngest.createFunction(
  { id: "scheduled-send-dispatcher", triggers: [{ cron: "* * * * *" }] },
  async ({ step }) => {
    const now = new Date().toISOString();
    const due = await step.run("find-due", async () => {
      const admin = createAdminClient();
      const [{ data: msgs }, { data: rems }] = await Promise.all([
        admin
          .from("messages")
          .select("id")
          .eq("status", "scheduled")
          .lte("scheduled_for", now)
          .limit(BATCH),
        admin
          .from("reminders")
          .select("id")
          .eq("status", "pending")
          .eq("mode", "remind_me")
          .lte("remind_at", now)
          .limit(BATCH),
      ]);
      return { messageIds: (msgs ?? []).map((m) => m.id), reminderIds: (rems ?? []).map((r) => r.id) };
    });

    const events = [
      ...due.messageIds.map((id) => ({ name: "message/send.requested", data: { message_id: id } })),
      ...due.reminderIds.map((id) => ({ name: "reminder/fire.requested", data: { reminder_id: id } })),
    ];
    if (events.length) await step.sendEvent("fan-out", events);
    return { messages: due.messageIds.length, reminders: due.reminderIds.length };
  },
);

// Send one due scheduled message (sequence touch or auto-send reminder).
export const sendScheduledMessage = inngest.createFunction(
  { id: "send-scheduled-message", concurrency: { limit: 5 }, triggers: [{ event: "message/send.requested" }] },
  async ({ event, step }) => {
    const messageId = event.data.message_id as string;
    const admin = createAdminClient();

    return await step.run("process", async () => {
      const { data: msg } = await admin
        .from("messages")
        .select("id, company_id, prospect_id, kind, sequence_step, status, scheduled_for, body, body_is_custom, step_intent, step_template")
        .eq("id", messageId)
        .maybeSingle();
      if (!msg || msg.status !== "scheduled" || !msg.prospect_id) return { skipped: "not_scheduled" };

      const cancel = (reason: string) =>
        admin
          .from("messages")
          .update({ status: "canceled", send_meta: { reason } })
          .eq("id", msg.id)
          .eq("status", "scheduled");
      const defer = (until: Date, reason: string) =>
        admin
          .from("messages")
          .update({ scheduled_for: until.toISOString(), send_meta: { reason } })
          .eq("id", msg.id)
          .eq("status", "scheduled");

      const [{ data: p }, { data: co }, { data: windows }, { data: voice }] = await Promise.all([
        admin
          .from("prospects")
          .select("status, phone_e164, first_name, job_type, quote_amount, quote_date, notes")
          .eq("id", msg.prospect_id)
          .maybeSingle(),
        admin
          .from("companies")
          .select("name, timezone, subscription_status, trial_messages_used, suspended_at")
          .eq("id", msg.company_id)
          .maybeSingle(),
        admin
          .from("sending_windows")
          .select("day_of_week, start_time, end_time, enabled")
          .eq("company_id", msg.company_id),
        admin
          .from("voice_profiles")
          .select("master_prompt")
          .eq("company_id", msg.company_id)
          .eq("is_latest", true)
          .maybeSingle(),
      ]);

      if (!p?.phone_e164 || !co) {
        await cancel("no_phone");
        return { skipped: "no_phone" };
      }
      if (co.suspended_at) {
        await cancel("suspended");
        return { skipped: "suspended" };
      }

      // Prospect status wins at send time. Paused only defers (Resume is
      // cheap); terminal states cancel (Resume re-arms canceled rows).
      if (msg.kind === "sequence" && STOP_STATUSES.has(p.status)) {
        if (p.status === "paused") {
          await defer(new Date(Date.now() + 6 * 3600_000), "deferred_paused");
          return { deferred: "paused" };
        }
        await cancel(p.status);
        return { skipped: p.status };
      }
      if (msg.kind === "reminder" && p.status === "opted_out") {
        await cancel("opted_out");
        await admin.from("reminders").update({ status: "canceled" }).eq("message_id", msg.id).eq("status", "pending");
        return { skipped: "opted_out" };
      }

      // Trial cap, enforced at the sending layer.
      if (co.subscription_status === "trialing" && (co.trial_messages_used ?? 0) >= TRIAL_CAP) {
        await admin.from("prospects").update({ status: "paused" }).eq("id", msg.prospect_id);
        await admin.from("events").insert({
          company_id: msg.company_id,
          type: "cap_reached",
          payload: { prospect_id: msg.prospect_id },
        });
        await cancel("trial_cap");
        return { skipped: "trial_cap" };
      }

      // Sending window + TCPA floor, checked at send time (prod only; dev
      // runs compressed test sequences at all hours). Deferred sends get a
      // few minutes of jitter so everything queued overnight does not fire
      // as one burst the second the window opens.
      const tz = co.timezone ?? "America/New_York";
      if (isProd() && !canSendNow(tz, windows ?? [])) {
        const next = nextSendTime(tz, windows ?? []) ?? new Date(Date.now() + 24 * 3600_000);
        await defer(new Date(next.getTime() + jitterMs(10)), "window");
        return { deferred: "window" };
      }

      // Minimum gap between automated sends to the same homeowner, enforced
      // at the sending layer so no timeline arrangement can stack texts.
      if (isProd()) {
        const { data: lastSent } = await admin
          .from("messages")
          .select("sent_at")
          .eq("prospect_id", msg.prospect_id)
          .eq("direction", "outbound")
          .in("kind", ["sequence", "reminder", "manual", "relay"])
          .not("sent_at", "is", null)
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const last = lastSent?.sent_at ? new Date(lastSent.sent_at).getTime() : 0;
        if (last && Date.now() - last < MIN_GAP_MS) {
          const earliest = new Date(last + MIN_GAP_MS + jitterMs(5));
          const next = canSendNow(tz, windows ?? [], earliest) ? earliest : nextSendTime(tz, windows ?? [], earliest) ?? earliest;
          await defer(next, "min_gap");
          return { deferred: "min_gap" };
        }
      }

      // Claim before drafting: scheduled -> queued is the idempotency lock,
      // so a duplicate event or racing dispatcher tick can never double-send.
      const { data: claimed } = await admin
        .from("messages")
        .update({ status: "queued" })
        .eq("id", msg.id)
        .eq("status", "scheduled")
        .select("id");
      if (!claimed?.length) return { skipped: "already_claimed" };

      // Compliance: identification + opt-out language go on the actual first
      // message this prospect ever receives (derived from the ledger, not the
      // step index, so a skipped step 1 cannot dodge it). Only homeowner-facing
      // kinds count: an owner_ping to the contractor is not contact with the
      // prospect and must not suppress the STOP line.
      const { data: prior } = await admin
        .from("messages")
        .select("id")
        .eq("prospect_id", msg.prospect_id)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .in("kind", ["sequence", "reminder", "manual", "relay"])
        .limit(1);
      const isFirst = !prior?.length;
      const businessName = co.name ?? "your contractor";
      const fillCtx = { firstName: p.first_name ?? "there", jobType: p.job_type, quoteAmount: p.quote_amount, businessName };

      // The row is self-contained: the contractor's own text fully overrides
      // our draft; otherwise the enrollment-snapshotted template, otherwise an
      // AI draft from the snapshotted intent.
      let body: string | null = null;
      if (msg.body_is_custom && msg.body?.trim()) {
        body = enforceCompliance(msg.body, isFirst, businessName);
      } else if (msg.step_template?.trim()) {
        body = enforceCompliance(fillTemplate(msg.step_template, fillCtx), isFirst, businessName);
      } else {
        let note = p.notes ?? null;
        let intent = msg.step_intent ?? "friendly follow-up";
        if (msg.kind === "reminder") {
          const { data: rem } = await admin.from("reminders").select("note").eq("message_id", msg.id).maybeSingle();
          intent = "circle back now, as the customer asked us to earlier; reference the earlier quote naturally";
          if (rem?.note) note = note ? `${note}\nCircle-back context: ${rem.note}` : `Circle-back context: ${rem.note}`;
        }
        const base = p.quote_date ? new Date(`${p.quote_date}T12:00:00Z`) : new Date();
        const daysSince = Math.max(0, Math.round((Date.now() - base.getTime()) / 86400000));
        const { system, prompt, temperature, maxTokens } = buildFollowupDrafterPrompt(
          voice?.master_prompt ?? "",
          {
            businessName,
            firstName: p.first_name ?? "there",
            jobType: p.job_type,
            quoteAmount: p.quote_amount,
            daysSinceQuote: daysSince,
            notes: note,
          },
          intent,
          isFirst,
        );
        try {
          const { text } = await generateText({ system, prompt, temperature, maxTokens });
          body = enforceCompliance(text, isFirst, businessName);
        } catch {
          // Unclaim and retry in 10 minutes; drafting hiccups must not eat a touch.
          await admin
            .from("messages")
            .update({ status: "scheduled", scheduled_for: new Date(Date.now() + 10 * 60_000).toISOString(), send_meta: { reason: "draft_retry" } })
            .eq("id", msg.id)
            .eq("status", "queued");
          return { deferred: "draft_failed" };
        }
      }

      // Freeze-race backstop, LAST thing before Twilio: drafting above takes
      // seconds, and a reply landing in that window flips the prospect but
      // cannot cancel this row anymore (it is already claimed 'queued'). A
      // recheck here shrinks the race to the Twilio call itself.
      const { data: p2 } = await admin.from("prospects").select("status").eq("id", msg.prospect_id).maybeSingle();
      if (p2 && (msg.kind === "sequence" ? STOP_STATUSES.has(p2.status) : p2.status === "opted_out")) {
        await admin.from("messages").update({ status: "canceled", send_meta: { reason: "frozen_after_claim" } }).eq("id", msg.id).eq("status", "queued");
        return { skipped: "frozen_after_claim" };
      }

      const res = await sendClaimedMessage({ messageId: msg.id, companyId: msg.company_id, to: p.phone_e164, body });
      if (res.sent) {
        const used = (co.trial_messages_used ?? 0) + 1;
        await admin.from("companies").update({ trial_messages_used: used }).eq("id", msg.company_id);
        if (msg.kind === "reminder") {
          await admin.from("reminders").update({ status: "fired" }).eq("message_id", msg.id).eq("status", "pending");
        }
        // Approaching-cap warning (once): the 50-cap freeze must never be the
        // first a trial customer hears about it.
        if (co.subscription_status === "trialing" && used >= TRIAL_WARN && used < TRIAL_CAP) {
          const { data: warned } = await admin
            .from("events")
            .select("id")
            .eq("company_id", msg.company_id)
            .eq("type", "trial_warning_sent")
            .limit(1)
            .maybeSingle();
          if (!warned) {
            await admin.from("events").insert({ company_id: msg.company_id, type: "trial_warning_sent", payload: { used } });
            const [{ data: owner }, { data: ownerEmail }] = await Promise.all([
              admin.from("users").select("cell_phone").eq("company_id", msg.company_id).not("cell_phone", "is", null).limit(1).maybeSingle(),
              admin.from("users").select("email").eq("company_id", msg.company_id).not("email", "is", null).limit(1).maybeSingle(),
            ]);
            const warnBody = `ReKnock: your trial has used ${used} of ${TRIAL_CAP} texts. When you hit ${TRIAL_CAP}, follow-ups pause until you upgrade in Settings > Billing. Nothing gets lost.`;
            if (owner?.cell_phone) {
              await sendSms({ companyId: msg.company_id, prospectId: null, to: owner.cell_phone, body: warnBody, idempotencyKey: `trial-warn:${msg.company_id}`, kind: "system" });
            }
            if (ownerEmail?.email && process.env.RESEND_API_KEY) {
              await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
                body: JSON.stringify({
                  from: "ReKnock <ops@getreknock.com>",
                  to: [ownerEmail.email],
                  subject: `Your ReKnock trial has ${TRIAL_CAP - used} texts left`,
                  text: `You have used ${used} of the ${TRIAL_CAP} texts included in your trial.\n\nWhen the cap is reached, active follow-ups pause (nothing is lost) until you upgrade. Upgrade any time from Settings > Billing in ReKnock.`,
                }),
              }).catch(() => {});
            }
          }
        }
      }
      return { sent: res.sent, skipped: res.skipped };
    });
  },
);

// "Remind me" ping: text the contractor's cell at the chosen time and open a
// relay session so their reply goes straight to that homeowner. Owner-facing,
// so quiet hours do not apply (it is their lead).
export const fireReminder = inngest.createFunction(
  { id: "fire-reminder", triggers: [{ event: "reminder/fire.requested" }] },
  async ({ event, step }) => {
    const reminderId = event.data.reminder_id as string;
    const admin = createAdminClient();

    return await step.run("process", async () => {
      const { data: claimed } = await admin
        .from("reminders")
        .update({ status: "fired" })
        .eq("id", reminderId)
        .eq("status", "pending")
        .select("id, company_id, prospect_id, note");
      const rem = claimed?.[0];
      if (!rem) return { skipped: "already_fired" };

      const [{ data: p }, { data: owner }] = await Promise.all([
        admin.from("prospects").select("first_name, job_type, phone_e164, status").eq("id", rem.prospect_id).maybeSingle(),
        admin.from("users").select("cell_phone").eq("company_id", rem.company_id).not("cell_phone", "is", null).limit(1).maybeSingle(),
      ]);
      await admin.from("events").insert({
        company_id: rem.company_id,
        type: "reminder_fired",
        payload: { prospect_id: rem.prospect_id, note: rem.note ?? null, had_cell: Boolean(owner?.cell_phone) },
      });
      if (!p || !owner?.cell_phone) return { skipped: "no_owner_cell" };

      const name = p.first_name ?? "your lead";
      const job = p.job_type ? `the ${p.job_type} quote` : "their quote";
      const notePart = rem.note ? ` You said: "${rem.note}".` : "";
      const body =
        p.status === "opted_out"
          ? `ReKnock reminder: circle back with ${name} about ${job}.${notePart} They opted out of texts, so give them a call: ${p.phone_e164 ?? "no number on file"}.`
          : `ReKnock reminder: circle back with ${name} about ${job}.${notePart} Reply here and we will text them from your ReKnock number, or call ${p.phone_e164 ?? "them"}.`;

      const res = await sendSms({
        companyId: rem.company_id,
        prospectId: rem.prospect_id,
        to: owner.cell_phone,
        body,
        idempotencyKey: `remindme:${rem.id}`,
        kind: "owner_ping",
        isRelay: true,
      });
      if (!res.sent && res.skipped === "twilio_error") {
        await inngest.send({
          name: "sms/retry.requested",
          data: { idempotency_key: `remindme:${rem.id}`, company_id: rem.company_id, to: owner.cell_phone, context: "reminder_ping" },
        });
      }
      if ((res.sent || res.skipped === "twilio_error") && p.status !== "opted_out") {
        await admin.from("relay_sessions").insert({
          company_id: rem.company_id,
          prospect_id: rem.prospect_id,
          owner_phone: owner.cell_phone,
        });
      }
      return { sent: res.sent, skipped: res.skipped };
    });
  },
);

// Retry a failed relay/owner-ping send with backoff. A contractor who never
// gets the "your lead replied" text has no idea they missed a lead, so these
// must not fail silently: Inngest re-attempts (failed -> queued claim inside
// retrySmsTo keeps it single-send), and the final failure pages the admin and
// leaves an events row.
export const retrySmsDelivery = inngest.createFunction(
  {
    id: "retry-sms-delivery",
    retries: 3,
    triggers: [{ event: "sms/retry.requested" }],
    onFailure: async ({ event }) => {
      const data = (event.data.event as { data: { idempotency_key: string; company_id: string; to: string; context: string } }).data;
      const admin = createAdminClient();
      await admin.from("failed_jobs").insert({
        company_id: data.company_id,
        job_type: "sms_retry_exhausted",
        payload: { idempotency_key: data.idempotency_key, context: data.context },
        error: "all retries failed",
      });
      await admin.from("events").insert({
        company_id: data.company_id,
        type: "relay_delivery_failed",
        payload: { idempotency_key: data.idempotency_key, context: data.context },
      });
      await notifyAdmin("Relay SMS could not be delivered", [
        `Company: ${data.company_id}`,
        `Context: ${data.context}`,
        `To: ${data.to}`,
        "All retries failed. The contractor has NOT been told about this reply; check their relay cell in /admin.",
      ]);
    },
  },
  async ({ event, step }) => {
    const { idempotency_key, to } = event.data as { idempotency_key: string; to: string };
    return await step.run("retry", async () => {
      // Throws on Twilio failure so Inngest backs off and retries.
      return await retrySmsTo(idempotency_key, to);
    });
  },
);

function twilioAuth(): string {
  return "Basic " + Buffer.from(`${env.twilioAccountSid()}:${env.twilioAuthToken()}`).toString("base64");
}

// Release a company's Twilio numbers (subscription canceled). Fired by the
// Stripe webhook; the webhook itself only enqueues (persist raw, ack fast).
// Rows are kept with status='released' for the audit trail.
export const releaseCompanyNumbers = inngest.createFunction(
  { id: "release-company-numbers", triggers: [{ event: "company/numbers.release" }] },
  async ({ event, step }) => {
    const { company_id, reason } = event.data as { company_id: string; reason: string };
    const admin = createAdminClient();

    return await step.run("release", async () => {
      const { data: rows } = await admin
        .from("phone_numbers")
        .select("id, e164, twilio_sid, status")
        .eq("company_id", company_id)
        .neq("status", "released");
      if (!rows?.length) return { released: 0 };

      const released: string[] = [];
      for (const n of rows) {
        if (n.twilio_sid) {
          const sid = env.twilioAccountSid();
          const resp = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${n.twilio_sid}.json`,
            { method: "DELETE", headers: { Authorization: twilioAuth() } },
          );
          // 404 = already gone in Twilio; anything else non-2xx is a real failure.
          if (!resp.ok && resp.status !== 404) {
            await admin.from("failed_jobs").insert({
              company_id,
              job_type: "number_release",
              payload: { e164: n.e164, twilio_sid: n.twilio_sid },
              error: `Twilio ${resp.status}`,
            });
            continue;
          }
        }
        await admin
          .from("phone_numbers")
          .update({ status: "released", released_at: new Date().toISOString() })
          .eq("id", n.id);
        await admin.from("events").insert({
          company_id,
          type: "number_released",
          payload: { e164: n.e164, reason },
        });
        if (n.twilio_sid) released.push(n.e164 ?? n.twilio_sid);
      }
      if (released.length) {
        await notifyAdmin("Twilio number released", [
          `Company: ${company_id}`,
          `Reason: ${reason}`,
          `Numbers: ${released.join(", ")}`,
          "Recurring Twilio cost stopped.",
        ]);
      }
      return { released: released.length };
    });
  },
);

// Weekly reconciliation: compare Twilio's number list against our records so
// no number quietly bills without an active company behind it. Also runnable
// on demand via the admin/reconcile.requested event.
export const numberReconciliation = inngest.createFunction(
  { id: "number-reconciliation", triggers: [{ cron: "0 13 * * 1" }, { event: "admin/reconcile.requested" }] },
  async ({ step }) => {
    const admin = createAdminClient();

    return await step.run("reconcile", async () => {
      // Everything we are paying for in Twilio.
      const sid = env.twilioAccountSid();
      const twilioNumbers: string[] = [];
      let url: string | null = `/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=100`;
      while (url) {
        const resp: Response = await fetch(`https://api.twilio.com${url}`, { headers: { Authorization: twilioAuth() } });
        if (!resp.ok) throw new Error(`Twilio list ${resp.status}`);
        const json = (await resp.json()) as { incoming_phone_numbers?: Array<{ phone_number: string }>; next_page_uri?: string | null };
        for (const n of json.incoming_phone_numbers ?? []) twilioNumbers.push(n.phone_number);
        url = json.next_page_uri ?? null;
      }

      // Everything we think we own, with the owning company's standing.
      const { data: rows } = await admin
        .from("phone_numbers")
        .select("e164, twilio_sid, status, company_id, companies(name, subscription_status, suspended_at)")
        .neq("status", "released");
      const live = rows ?? [];
      const liveE164 = new Set(live.map((r) => r.e164).filter(Boolean));
      const shared = new Set(
        (process.env.TWILIO_SHARED_NUMBERS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      );

      // Twilio numbers nobody accounts for (still billing, no owner).
      const orphans = twilioNumbers.filter((n) => !liveE164.has(n) && !shared.has(n));
      // Our rows whose company canceled: release should have fired.
      const shouldRelease = live
        .filter((r) => {
          const raw = r.companies as unknown;
          const c = (Array.isArray(raw) ? raw[0] : raw) as { subscription_status: string | null } | null;
          return !c || c.subscription_status === "canceled";
        })
        .map((r) => ({ e164: r.e164, company_id: r.company_id }));
      // Rows claiming a real Twilio number that Twilio no longer lists.
      const dangling = live
        .filter((r) => r.twilio_sid && r.e164 && !twilioNumbers.includes(r.e164))
        .map((r) => ({ e164: r.e164, company_id: r.company_id }));

      const flags = orphans.length + shouldRelease.length + dangling.length;
      await admin.from("events").insert({
        company_id: null,
        type: "admin.number_reconciliation",
        payload: {
          twilio_count: twilioNumbers.length,
          tracked_count: live.length,
          orphans,
          should_release: shouldRelease,
          dangling,
        },
      });
      if (flags > 0) {
        await notifyAdmin("Number reconciliation found issues", [
          `Orphan Twilio numbers (billing, untracked): ${orphans.join(", ") || "none"}`,
          `Tracked numbers on canceled companies: ${shouldRelease.map((r) => r.e164).join(", ") || "none"}`,
          `Tracked numbers missing in Twilio: ${dangling.map((r) => r.e164).join(", ") || "none"}`,
          "Details in the admin.number_reconciliation event.",
        ]);
      }
      return { twilio: twilioNumbers.length, tracked: live.length, flags };
    });
  },
);

// Inbound email to quotes@getreknock.com: match the sender to a company,
// extract the quote, and enroll - or record exactly why not. Every path ends
// in a resolution on inbound_emails; nothing is silently dropped.
export const processInboundEmail = inngest.createFunction(
  { id: "process-inbound-email", retries: 3, triggers: [{ event: "email/inbound.received" }] },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const inboundId = event.data.inboundEmailId as string;

    const matched = await step.run("match-sender", async () => {
      const { data: mail } = await admin.from("inbound_emails").select("id, from_addr, to_addr, subject, raw").eq("id", inboundId).maybeSingle();
      if (!mail) return { done: true as const };

      const raw = (mail.raw ?? {}) as { data?: { email_id?: string; text?: string; html?: string } };
      // Resend's email.received webhook carries metadata only; body + headers
      // are fetched from the received-emails API.
      const fetchFull = async (): Promise<{ text: string; headers: Record<string, string> }> => {
        let text = raw.data?.text || (raw.data?.html ?? "").replace(/<[^>]+>/g, " ");
        const headers: Record<string, string> = {};
        if (raw.data?.email_id && process.env.RESEND_API_KEY) {
          // Verified live 2026-07-13: received-email content lives at
          // /emails/receiving/{id} (returns text, html, headers, attachments).
          const resp = await fetch(`https://api.resend.com/emails/receiving/${raw.data.email_id}`, {
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          });
          if (resp.ok) {
            const full = (await resp.json()) as { text?: string; html?: string; headers?: Record<string, string> | { name: string; value: string }[] };
            if (!text.trim()) text = full.text || (full.html ?? "").replace(/<[^>]+>/g, " ");
            const h = full.headers;
            if (Array.isArray(h)) for (const x of h) headers[x.name.toLowerCase()] = x.value;
            else if (h) for (const k of Object.keys(h)) headers[k.toLowerCase()] = h[k];
          }
        }
        return { text, headers };
      };

      // Catch-all forward: the root MX moved from ImprovMX to Resend
      // (2026-07-13), so any mail NOT addressed to the intake address gets
      // re-sent to the platform admin's inbox. Covers every old alias without
      // needing an alias list; nothing addressed to the domain goes dark.
      const to = bareEmail(mail.to_addr);
      if (to && to !== INTAKE_EMAIL.toLowerCase()) {
        const ourDomain = INTAKE_EMAIL.split("@")[1];
        // Loop protection, four independent layers (a live loop on 2026-07-13
        // ran 60 iterations in 4 minutes and exhausted the day's send quota;
        // any ONE of these would have stopped it):
        // 1. Never process mail sent BY our own forwarder identity.
        const sender = bareEmail(mail.from_addr);
        if (sender === `forward@${ourDomain}`) {
          await admin.from("inbound_emails").update({ resolution: "ignored" }).eq("id", inboundId);
          return { done: true as const };
        }
        // 2. Never re-forward a message our system already forwarded, no
        //    matter what address it claims to be from (the marker header
        //    survives any hop topology).
        const { text: fwdBody, headers } = await fetchFull();
        if (headers["x-reknock-forwarded"]) {
          await admin.from("inbound_emails").update({ resolution: "ignored" }).eq("id", inboundId);
          return { done: true as const };
        }
        // 3. Circuit breaker: forwarding halts outright above a hard rate
        //    that no legitimate alias traffic reaches. Alerts instead of loops.
        const { count: recentForwards } = await admin
          .from("events")
          .select("id", { count: "exact", head: true })
          .eq("type", "inbound_email_forwarded")
          .gt("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
        if ((recentForwards ?? 0) >= 15) {
          await admin.from("inbound_emails").update({ resolution: "ignored" }).eq("id", inboundId);
          await admin.from("failed_jobs").insert({
            company_id: null,
            job_type: "email_forward_circuit_open",
            payload: { inbound_email_id: inboundId, recent_forwards: recentForwards },
            error: "forwarding circuit breaker tripped (>=15 forwards in 10 minutes); possible loop or abuse",
          });
          await notifyAdmin("Email forwarding halted by circuit breaker", [
            `${recentForwards} forwards in the last 10 minutes - possible loop or abuse.`,
            "Inbound mail is still stored in inbound_emails; forwarding resumes when the 10-minute window clears.",
          ]);
          return { done: true as const };
        }
        // 4. Only forward to destinations OFF our receiving domain (an
        //    in-domain destination arrives right back at this webhook).
        const { data: admins } = await admin.from("users").select("email").eq("platform_admin", true).not("email", "is", null);
        const dest = (admins ?? [])
          .map((a) => (a.email as string).toLowerCase())
          .filter((e) => !e.endsWith(`@${ourDomain}`));
        if (dest.length && process.env.RESEND_API_KEY) {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
            body: JSON.stringify({
              from: "ReKnock Forwarder <forward@getreknock.com>",
              to: dest,
              reply_to: mail.from_addr,
              subject: `[${to}] ${mail.subject ?? "(no subject)"}`,
              text: `Forwarded from ${to} (originally sent by ${mail.from_addr}):\n\n${fwdBody}`,
              headers: { "X-ReKnock-Forwarded": inboundId },
            }),
          });
          if (!resp.ok) throw new Error(`forward failed: ${resp.status}`); // Inngest retries
        }
        await admin.from("inbound_emails").update({ resolution: "ignored" }).eq("id", inboundId);
        await admin.from("events").insert({ company_id: null, type: "inbound_email_forwarded", payload: { inbound_email_id: inboundId, to, forwarded_to: dest } });
        return { done: true as const };
      }

      const sender = bareEmail(mail.from_addr);
      const { data: match } = sender
        ? await admin.from("company_sender_emails").select("company_id").eq("email", sender).not("verified_at", "is", null).maybeSingle()
        : { data: null };
      if (!match) {
        await admin.from("inbound_emails").update({ resolution: "unmatched" }).eq("id", inboundId);
        await admin.from("events").insert({ company_id: null, type: "inbound_email_unmatched", payload: { inbound_email_id: inboundId, from: mail.from_addr } });
        return { done: true as const };
      }
      await admin.from("inbound_emails").update({ company_id: match.company_id }).eq("id", inboundId);
      const { text } = await fetchFull();
      return { done: false as const, companyId: match.company_id as string, text: `${mail.subject ?? ""}\n\n${text}`.trim().slice(0, 20_000) };
    });
    if (matched.done) return { skipped: true };

    const extraction = await step.run("extract", async () => {
      const { system, prompt, temperature, maxTokens } = buildQuoteExtractorPrompt(matched.text);
      const { text } = await generateText({ system, prompt, temperature, maxTokens });
      const parsed = parseJson<QuoteExtraction>(text);
      await admin.from("inbound_emails").update({ parse_result: parsed as unknown as Record<string, unknown> }).eq("id", inboundId);
      return parsed;
    });

    return await step.run("resolve", async () => {
      const companyId = matched.companyId;
      const notifyOwner = async (body: string) => {
        const { data: owner } = await admin.from("users").select("cell_phone").eq("company_id", companyId).not("cell_phone", "is", null).limit(1).maybeSingle();
        if (owner?.cell_phone) {
          await sendSms({ companyId, prospectId: null, to: owner.cell_phone, body, idempotencyKey: `email_intake:${inboundId}`, kind: "system" });
        }
      };

      const firstName = extraction?.first_name?.trim();
      const phone = extraction?.phone ? normalizeIntakePhone(extraction.phone) : null;
      const phoneConf = (extraction?.confidence?.phone as number | undefined) ?? 0;
      if (!firstName || !phone || phoneConf < 0.6) {
        // Never guess a phone number (extractor rule); ask instead of texting a stranger.
        await admin.from("inbound_emails").update({ resolution: "needs_review" }).eq("id", inboundId);
        await notifyOwner(
          `ReKnock: got your forwarded quote email${firstName ? ` for ${firstName}` : ""}, but we could not find a phone number we trust. Open ReKnock and add the quote there so we can start chasing it.`,
        );
        return { resolution: "needs_review" };
      }

      const { data: existing } = await admin
        .from("prospects")
        .select("id, first_name, status")
        .eq("company_id", companyId)
        .eq("phone_e164", phone)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing) {
        // Same homeowner already in the book: never silently start a second
        // parallel sequence from an email.
        await admin.from("inbound_emails").update({ resolution: "updated_prospect", prospect_id: existing.id }).eq("id", inboundId);
        await admin.from("events").insert({ company_id: companyId, type: "inbound_email_existing_prospect", payload: { inbound_email_id: inboundId, prospect_id: existing.id } });
        await notifyOwner(`ReKnock: got your quote email for ${firstName}. They are already in your pipeline (${existing.status.replace(/_/g, " ")}), so we did not start a second chase. Open their thread to make changes.`);
        return { resolution: "updated_prospect" };
      }

      const amountRaw = String(extraction?.quote_amount ?? "").replace(/[^0-9.]/g, "");
      const { data: prospect, error } = await admin
        .from("prospects")
        .insert({
          company_id: companyId,
          first_name: firstName,
          last_name: extraction?.last_name?.trim() || null,
          phone_e164: phone,
          email: extraction?.email?.trim()?.toLowerCase() || null,
          address: extraction?.address?.trim() || null,
          job_type: extraction?.job_type?.trim() || null,
          quote_amount: amountRaw ? Number(amountRaw) : null,
          quote_date: /^\d{4}-\d{2}-\d{2}$/.test(extraction?.quote_date ?? "") ? extraction!.quote_date : new Date().toISOString().slice(0, 10),
          status: "sequencing",
          source: "email_forward",
          consent_path: "verbal_at_quote",
          consent_captured_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (error || !prospect) throw new Error(`prospect insert failed: ${error?.message}`);

      const [{ data: campaign }, { data: co }, { data: windows }] = await Promise.all([
        admin.from("campaigns").select("id, steps").eq("company_id", companyId).eq("is_default", true).maybeSingle(),
        admin.from("companies").select("timezone").eq("id", companyId).maybeSingle(),
        admin.from("sending_windows").select("day_of_week, start_time, end_time, enabled").eq("company_id", companyId),
      ]);
      if (campaign?.id) await admin.from("prospects").update({ campaign_id: campaign.id }).eq("id", prospect.id);
      const steps = ((campaign?.steps as CampaignStep[] | null) ?? []).length ? (campaign!.steps as CampaignStep[]) : DEFAULT_CAMPAIGN_STEPS;
      const testMode = !isProd();
      const startAt = computeStartAt({ choice: "recommended", customIso: null, tz: co?.timezone ?? "America/New_York", windows: (windows ?? []) as Window[], testMode });
      const scheduled = await scheduleSequence({ companyId, prospectId: prospect.id, steps, startAt, testMode });

      await admin.from("inbound_emails").update({ resolution: "new_prospect", prospect_id: prospect.id }).eq("id", inboundId);
      await admin.from("events").insert({ company_id: companyId, type: "inbound_email_enrolled", payload: { inbound_email_id: inboundId, prospect_id: prospect.id, touches: scheduled.length } });
      const firstTouch = scheduled[0]?.scheduledFor;
      await notifyOwner(
        `ReKnock: got it. We will start following up with ${firstName}${extraction?.job_type ? ` about the ${extraction.job_type} quote` : ""}${firstTouch ? ` on ${new Date(firstTouch).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}. Open ReKnock to change anything.`,
      );
      return { resolution: "new_prospect", prospectId: prospect.id };
    });
  },
);

// Founder-voiced onboarding series: five emails over ~12 days after a
// contractor completes onboarding. Every send re-checks the company at send
// time (canceled/suspended/internal companies stop getting mail mid-series).
export const onboardingDrip = inngest.createFunction(
  { id: "onboarding-drip", retries: 2, triggers: [{ event: "company/onboarding.completed" }] },
  async ({ event, step }) => {
    const companyId = event.data.company_id as string;
    const admin = createAdminClient();

    const eligible = await step.run("start", async () => {
      // One series per company, ever (finishOnboarding can be re-entered).
      const { data: already } = await admin.from("events").select("id").eq("company_id", companyId).eq("type", "onboarding_drip_started").limit(1).maybeSingle();
      if (already) return false;
      await admin.from("events").insert({ company_id: companyId, type: "onboarding_drip_started", payload: {} });
      return true;
    });
    if (!eligible) return { skipped: "already_started" };

    const startedAt = Date.now();
    let sent = 0;
    for (let i = 0; i < ONBOARDING_DRIP.length; i++) {
      const email = ONBOARDING_DRIP[i];
      await step.sleepUntil(`wait-${i + 1}`, new Date(startedAt + email.delayHours * 3600_000));
      const ok = await step.run(`send-${i + 1}`, async () => {
        const [{ data: co }, { data: user }] = await Promise.all([
          admin.from("companies").select("subscription_status, suspended_at, is_internal, forwarding_slug").eq("id", companyId).maybeSingle(),
          admin.from("users").select("email, full_name").eq("company_id", companyId).not("email", "is", null).limit(1).maybeSingle(),
        ]);
        if (!co || co.is_internal || co.suspended_at || co.subscription_status === "canceled" || !user?.email) return false;
        if (!process.env.RESEND_API_KEY) return false;
        const firstName = (user.full_name ?? "").trim().split(/\s+/)[0] ?? "";
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: DRIP_FROM,
            to: [user.email],
            subject: email.subject,
            text: email.body({ firstName, intakeEmail: INTAKE_EMAIL }),
          }),
        });
        if (!resp.ok) throw new Error(`drip send failed: ${resp.status}`); // Inngest retries
        await admin.from("events").insert({ company_id: companyId, type: "onboarding_drip_sent", payload: { position: i + 1, subject: email.subject } });
        return true;
      });
      if (!ok) return { sent, stopped: `email_${i + 1}_ineligible` };
      sent++;
    }
    return { sent };
  },
);

export const functions = [scheduledSendDispatcher, sendScheduledMessage, fireReminder, retrySmsDelivery, releaseCompanyNumbers, numberReconciliation, processInboundEmail, onboardingDrip];
