import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";

// Starter's first usage boundary. Keep this as a quote allowance rather than
// a text allowance so the product can change follow-up timing without making
// the plan feel unpredictable.
export const MONTHLY_QUOTE_LIMIT = 100;

function currentPeriodStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function monthlyQuoteUsage(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ used: number; remaining: number }> {
  const { data, error } = await supabase
    .from("company_monthly_quote_usage")
    .select("quote_count")
    .eq("company_id", companyId)
    .eq("period_start", currentPeriodStart())
    .maybeSingle();

  if (error) throw new Error("Could not check monthly quote usage.");

  const used = data?.quote_count ?? 0;
  return { used, remaining: Math.max(0, MONTHLY_QUOTE_LIMIT - used) };
}

export function monthlyQuoteLimitMessage(): string {
  return `You have reached the Starter limit of ${MONTHLY_QUOTE_LIMIT} new quotes this month. You can add more quotes next month.`;
}

type UsageNotification = {
  threshold: 50 | 75 | 90 | 100;
  flag: "email_50_sent" | "email_75_sent" | "email_90_sent" | "email_100_sent";
  type: "quote_limit_warning" | "quote_limit_reached";
};

const USAGE_NOTIFICATIONS: UsageNotification[] = [
  { threshold: 50, flag: "email_50_sent", type: "quote_limit_warning" },
  { threshold: 75, flag: "email_75_sent", type: "quote_limit_warning" },
  { threshold: 90, flag: "email_90_sent", type: "quote_limit_warning" },
  { threshold: 100, flag: "email_100_sent", type: "quote_limit_reached" },
];

function usageEmail(threshold: UsageNotification["threshold"], used: number): { subject: string; text: string } {
  if (threshold === 100) {
    return {
      subject: "You reached your ReKnock quote limit",
      text: `You have used ${used} of ${MONTHLY_QUOTE_LIMIT} new quotes this month.

Your existing follow-up sequences are still running. New quotes will be available next month.

Nothing is lost. Reply to this email if you need help with your account.

ReKnock`,
    };
  }

  const remaining = MONTHLY_QUOTE_LIMIT - used;
  return {
    subject: `You have used ${used} of ${MONTHLY_QUOTE_LIMIT} ReKnock quotes`,
    text: `You have used ${used} of ${MONTHLY_QUOTE_LIMIT} new quotes this month, with ${remaining} remaining.

Your existing follow-ups will continue running. We will remind you before you reach the monthly allowance.

ReKnock`,
  };
}

// Creates one in-app event and one email per threshold. The boolean claim is
// performed in the database so repeated imports cannot send duplicate alerts.
export async function notifyQuoteUsage(companyId: string): Promise<void> {
  const admin = createAdminClient();
  const periodStart = currentPeriodStart();
  const { data: usage } = await admin
    .from("company_monthly_quote_usage")
    .select("quote_count, email_50_sent, email_75_sent, email_90_sent, email_100_sent")
    .eq("company_id", companyId)
    .eq("period_start", periodStart)
    .maybeSingle();
  if (!usage) return;

  const { data: owner } = await admin
    .from("users")
    .select("email")
    .eq("company_id", companyId)
    .not("email", "is", null)
    .limit(1)
    .maybeSingle();

  for (const item of USAGE_NOTIFICATIONS) {
    if (usage.quote_count < item.threshold || usage[item.flag]) continue;

    const { data: claimed } = await admin
      .from("company_monthly_quote_usage")
      .update({ [item.flag]: true })
      .eq("company_id", companyId)
      .eq("period_start", periodStart)
      .eq(item.flag, false)
      .select("quote_count")
      .maybeSingle();
    if (!claimed) continue;

    const email = usageEmail(item.threshold, claimed.quote_count);
    await admin.from("events").insert({
      company_id: companyId,
      type: item.type,
      payload: {
        threshold: item.threshold,
        used: claimed.quote_count,
        limit: MONTHLY_QUOTE_LIMIT,
        period_start: periodStart,
      },
    });

    if (owner?.email && process.env.RESEND_API_KEY) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: "ReKnock <ops@getreknock.com>",
            to: [owner.email],
            subject: email.subject,
            text: email.text,
          }),
        });
        if (!response.ok) throw new Error(`Resend ${response.status}`);
      } catch (error) {
        await admin.from("failed_jobs").insert({
          company_id: companyId,
          job_type: "quote_usage_notification_email",
          payload: { threshold: item.threshold, used: claimed.quote_count },
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
