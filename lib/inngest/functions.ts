import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai";
import { buildFollowupDrafterPrompt, enforceCompliance, fillTemplate } from "@/lib/prompts/followup-drafter";
import { sendSms, sendClaimedMessage, canSendNow, nextSendTime } from "@/lib/twilio";
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
const BATCH = 50;

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
        .select("id, company_id, prospect_id, kind, sequence_step, status, scheduled_for")
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
          .select("status, phone_e164, first_name, job_type, quote_amount, quote_date, campaign_id, notes")
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
      // runs compressed test sequences at all hours).
      const tz = co.timezone ?? "America/New_York";
      if (isProd() && !canSendNow(tz, windows ?? [])) {
        const next = nextSendTime(tz, windows ?? []) ?? new Date(Date.now() + 24 * 3600_000);
        await defer(next, "window");
        return { deferred: "window" };
      }

      // Per-prospect override from the thread (skip or contractor's own text).
      let overrideText: string | null = null;
      if (msg.kind === "sequence" && msg.sequence_step != null) {
        const { data: override } = await admin
          .from("sequence_overrides")
          .select("action, custom_text")
          .eq("prospect_id", msg.prospect_id)
          .eq("step_index", msg.sequence_step)
          .maybeSingle();
        if (override?.action === "skip") {
          await cancel("user_skip");
          return { skipped: "user_skip" };
        }
        if (override?.action === "custom" && override.custom_text?.trim()) overrideText = override.custom_text.trim();
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

      // Freeze-race backstop: a reply that landed between the checks above
      // and the claim must still win.
      const { data: p2 } = await admin.from("prospects").select("status").eq("id", msg.prospect_id).maybeSingle();
      if (msg.kind === "sequence" && p2 && STOP_STATUSES.has(p2.status)) {
        await admin.from("messages").update({ status: "canceled", send_meta: { reason: "frozen_after_claim" } }).eq("id", msg.id);
        return { skipped: "frozen_after_claim" };
      }

      // Compliance: identification + opt-out language go on the actual first
      // message this prospect ever receives (derived from the ledger, not the
      // step index, so a skipped step 1 cannot dodge it).
      const { data: prior } = await admin
        .from("messages")
        .select("id")
        .eq("prospect_id", msg.prospect_id)
        .eq("direction", "outbound")
        .eq("status", "sent")
        .limit(1);
      const isFirst = !prior?.length;
      const businessName = co.name ?? "your contractor";
      const fillCtx = { firstName: p.first_name ?? "there", jobType: p.job_type, quoteAmount: p.quote_amount, businessName };

      let steps: CampaignStep[] = DEFAULT_CAMPAIGN_STEPS;
      if (p.campaign_id) {
        const { data: c } = await admin.from("campaigns").select("steps").eq("id", p.campaign_id).maybeSingle();
        const cs = c?.steps as CampaignStep[] | null;
        if (Array.isArray(cs) && cs.length) steps = cs;
      }
      const stepDef = msg.sequence_step != null ? steps[msg.sequence_step] : undefined;

      // The campaign editor can toggle a step off after enrollment; honor it.
      if (msg.kind === "sequence" && stepDef?.enabled === false && !overrideText) {
        await admin.from("messages").update({ status: "canceled", send_meta: { reason: "step_disabled" } }).eq("id", msg.id);
        return { skipped: "step_disabled" };
      }

      let body: string | null = null;
      if (overrideText) {
        body = enforceCompliance(overrideText, isFirst, businessName);
      } else if (msg.kind === "sequence" && stepDef?.template?.trim()) {
        body = enforceCompliance(fillTemplate(stepDef.template, fillCtx), isFirst, businessName);
      } else {
        let note = p.notes ?? null;
        let intent = stepDef?.intent ?? "friendly follow-up";
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

      const res = await sendClaimedMessage({ messageId: msg.id, companyId: msg.company_id, to: p.phone_e164, body });
      if (res.sent) {
        await admin
          .from("companies")
          .update({ trial_messages_used: (co.trial_messages_used ?? 0) + 1 })
          .eq("id", msg.company_id);
        if (msg.kind === "reminder") {
          await admin.from("reminders").update({ status: "fired" }).eq("message_id", msg.id).eq("status", "pending");
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
      if (res.sent && p.status !== "opted_out") {
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

export const functions = [scheduledSendDispatcher, sendScheduledMessage, fireReminder];
