import { inngest } from "./client";
import { createAdminClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai";
import { buildFollowupDrafterPrompt, enforceCompliance } from "@/lib/prompts/followup-drafter";
import { sendSms, canSendNow } from "@/lib/twilio";

type Step = { day_offset: number; intent?: string };
const DEFAULT_STEPS: Step[] = [
  { day_offset: 2, intent: "gentle check-in" },
  { day_offset: 5, intent: "value nudge" },
  { day_offset: 10, intent: "still interested" },
  { day_offset: 20, intent: "final courteous close" },
];
const STOP_STATUSES = new Set(["replied", "opted_out", "won", "lost", "paused"]);
const TRIAL_CAP = 50;

// The 4-touch sequence. cancelOn freezes ALL remaining touches the instant a
// reply or opt-out event fires (atomic freeze, invariant 2). Every send is
// idempotent via the messages ledger (invariant 1).
export const prospectSequence = inngest.createFunction(
  {
    id: "prospect-sequence",
    triggers: [{ event: "prospect/enrolled" }],
    cancelOn: [
      { event: "prospect/replied", match: "data.prospect_id" },
      { event: "prospect/opted_out", match: "data.prospect_id" },
    ],
  },
  async ({ event, step }) => {
    const { company_id, prospect_id, test_mode } = event.data;
    const admin = createAdminClient();

    const ctx = await step.run("load-context", async () => {
      const [{ data: company }, { data: voice }, { data: prospect }, { data: windows }] = await Promise.all([
        admin.from("companies").select("name, timezone").eq("id", company_id).single(),
        admin.from("voice_profiles").select("master_prompt").eq("company_id", company_id).eq("is_latest", true).maybeSingle(),
        admin.from("prospects").select("quote_date, campaign_id").eq("id", prospect_id).single(),
        admin.from("sending_windows").select("day_of_week, start_time, end_time, enabled").eq("company_id", company_id),
      ]);
      let steps = DEFAULT_STEPS;
      if (prospect?.campaign_id) {
        const { data: c } = await admin.from("campaigns").select("steps").eq("id", prospect.campaign_id).maybeSingle();
        const cs = c?.steps as Step[] | null;
        if (Array.isArray(cs) && cs.length) steps = cs;
      }
      return { company, masterPrompt: voice?.master_prompt ?? "", quote_date: prospect?.quote_date ?? null, windows: windows ?? [], steps };
    });

    if (!ctx.company) return { stopped: "missing company" };
    const tz = ctx.company.timezone ?? "America/New_York";
    const base = ctx.quote_date ? new Date(`${ctx.quote_date}T12:00:00Z`) : new Date();

    for (let i = 0; i < ctx.steps.length; i++) {
      const s = ctx.steps[i];
      const sendAt = new Date(base);
      if (test_mode) sendAt.setMinutes(sendAt.getMinutes() + (s.day_offset ?? 0));
      else sendAt.setDate(sendAt.getDate() + (s.day_offset ?? 0));
      await step.sleepUntil(`wait-${i}`, sendAt);

      // Respect sending window / quiet hours at send time (skipped in test mode).
      if (!test_mode) {
        for (let a = 0; a < 96; a++) {
          const ok = await step.run(`can-send-${i}-${a}`, async () => canSendNow(tz, ctx.windows));
          if (ok) break;
          await step.sleep(`window-wait-${i}-${a}`, "30m");
        }
      }

      await step.run(`send-${i}`, async () => {
        const { data: p } = await admin
          .from("prospects")
          .select("status, phone_e164, first_name, job_type, quote_amount")
          .eq("id", prospect_id)
          .single();
        if (!p || STOP_STATUSES.has(p.status) || !p.phone_e164) return { skipped: "inactive" };

        const { data: co } = await admin
          .from("companies")
          .select("name, subscription_status, trial_messages_used, suspended_at")
          .eq("id", company_id)
          .single();
        if (co?.suspended_at) return { skipped: "suspended" };
        if (co?.subscription_status === "trialing" && (co.trial_messages_used ?? 0) >= TRIAL_CAP) {
          await admin.from("prospects").update({ status: "paused" }).eq("id", prospect_id);
          await admin.from("events").insert({ company_id, type: "cap_reached", payload: { prospect_id } });
          return { skipped: "trial_cap" };
        }

        const isFirst = i === 0;
        const daysSince = Math.max(0, Math.round((Date.now() - base.getTime()) / 86400000));
        const { system, prompt, temperature, maxTokens } = buildFollowupDrafterPrompt(
          ctx.masterPrompt,
          {
            businessName: co?.name ?? "your contractor",
            firstName: p.first_name ?? "there",
            jobType: p.job_type,
            quoteAmount: p.quote_amount,
            daysSinceQuote: daysSince,
          },
          s.intent ?? "friendly follow-up",
          isFirst,
        );

        let body: string;
        try {
          const { text } = await generateText({ system, prompt, temperature, maxTokens });
          body = enforceCompliance(text, isFirst, co?.name ?? "");
        } catch {
          return { skipped: "draft_failed" };
        }

        const res = await sendSms({
          companyId: company_id,
          prospectId: prospect_id,
          to: p.phone_e164,
          body,
          idempotencyKey: `touch:${prospect_id}:${i}`,
          sequenceStep: i,
        });
        if (res.sent) {
          await admin
            .from("companies")
            .update({ trial_messages_used: (co?.trial_messages_used ?? 0) + 1 })
            .eq("id", company_id);
        }
        return { sent: res.sent, skipped: res.skipped };
      });
    }

    return { done: true };
  },
);

export const functions = [prospectSequence];
