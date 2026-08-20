import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { DEFAULT_CAMPAIGN_STEPS, stepEnabled, type CampaignStep } from "@/lib/campaign";
import { canSendNow, nextSendTime, type Window } from "@/lib/twilio";

// A homeowner who texted STOP is suppressed for THIS company forever, across
// every quote (prospects.status='opted_out'). The flag is NOT cleared by a
// soft-delete, so these lookups intentionally ignore deleted_at: re-adding or
// re-importing the same number must stay blocked until the homeowner
// re-initiates contact (the Twilio inbound webhook lifts it on a genuine
// affirmative reply). Scope is (company_id, phone) so Contractor A's opt-out
// never blocks Contractor B.
export async function findActiveOptOut(
  supabase: SupabaseClient,
  companyId: string,
  phoneE164: string,
): Promise<{ optedOut: boolean; since: string | null }> {
  const { data: opted } = await supabase
    .from("prospects")
    .select("id")
    .eq("company_id", companyId)
    .eq("phone_e164", phoneE164)
    .eq("status", "opted_out")
    .limit(1)
    .maybeSingle();
  if (!opted) return { optedOut: false, since: null };
  // Best-effort opt-out date from the append-only ledger, for the message.
  const { data: ev } = await supabase
    .from("events")
    .select("created_at")
    .eq("company_id", companyId)
    .eq("type", "opt_out")
    .contains("payload", { phone: phoneE164 })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { optedOut: true, since: ev?.created_at ?? null };
}

// Set-based variant for the CSV import: which of these phones are opted out
// for this company. Same scope + soft-delete-ignoring rules as above.
export async function findOptedOutPhones(
  supabase: SupabaseClient,
  companyId: string,
  phones: string[],
): Promise<Set<string>> {
  if (!phones.length) return new Set();
  const { data } = await supabase
    .from("prospects")
    .select("phone_e164")
    .eq("company_id", companyId)
    .eq("status", "opted_out")
    .in("phone_e164", phones);
  return new Set((data ?? []).map((p) => p.phone_e164 as string));
}

// The scheduled-send primitive. Every future automated send is a `messages`
// row with status='scheduled' + scheduled_for; the Inngest dispatcher fires
// them and re-checks status/opt-out/cap/window at send time. Each row
// snapshots its drafting inputs (step_intent/step_template) at enrollment, so
// a prospect's timeline is fully self-contained and individually editable:
// move it, rewrite it, delete it, add to it. The campaign in /campaign is
// only the template new prospects inherit.

export type ScheduledStep = { step: number; scheduledFor: string; messageId: string };

export function touchKey(prospectId: string, stepIndex: number): string {
  return `touch:${prospectId}:${stepIndex}`;
}

// Off production, day gaps compress to minutes so a full sequence can be
// watched end to end. On production, later touches get a few minutes of
// random jitter so every prospect enrolled the same morning does not fire at
// the identical instant (carriers penalize simultaneous bursts of similar
// content).
function gapTime(startAt: Date, gapDays: number, testMode: boolean): Date {
  const d = new Date(startAt);
  if (testMode) d.setMinutes(d.getMinutes() + gapDays);
  else {
    d.setDate(d.getDate() + gapDays);
    if (gapDays > 0) d.setTime(d.getTime() + Math.floor(Math.random() * 10 * 60_000));
  }
  return d;
}

export type StartChoice = "now" | "tomorrow" | "recommended" | "custom";

function tzDayKey(d: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

// The instant a given calendar day (company tz) reaches 8am local.
function atMorningTz(base: Date, tz: string): Date {
  const key = tzDayKey(base, tz);
  const t = new Date(base.getTime() - 30 * 3600_000);
  for (let i = 0; i < 60 * 4; i++) {
    t.setTime(t.getTime() + 15 * 60_000);
    if (tzDayKey(t, tz) === key) {
      try {
        const hour = Number(
          new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", hour12: false })
            .formatToParts(t)
            .find((p) => p.type === "hour")?.value ?? "0",
        );
        if (hour >= 8) return new Date(t);
      } catch {
        return base;
      }
    }
  }
  return base;
}

// When the first touch goes out, per the contractor's choice at quote intake:
// "now" sends on the next dispatcher tick (windows still respected at send),
// "tomorrow" and the recommended "in 2 days" land in the morning slot of that
// day, custom times outside sending hours roll forward to the nearest valid
// slot. Off production the day choices compress to minutes.
export function computeStartAt(opts: {
  choice: StartChoice;
  customIso?: string | null;
  tz: string;
  windows: Window[];
  testMode: boolean;
}): Date {
  const now = new Date();
  if (opts.choice === "custom" && opts.customIso) {
    const when = new Date(opts.customIso);
    if (!Number.isNaN(when.getTime()) && when.getTime() > now.getTime()) {
      if (canSendNow(opts.tz, opts.windows, when)) return when;
      return nextSendTime(opts.tz, opts.windows, when) ?? when;
    }
  }
  if (opts.choice === "now") return now;
  const days = opts.choice === "tomorrow" ? 1 : 2;
  if (opts.testMode) return new Date(now.getTime() + days * 60_000);
  const morning = atMorningTz(new Date(now.getTime() + days * 24 * 3600_000), opts.tz);
  const slot = nextSendTime(opts.tz, opts.windows, morning) ?? morning;
  // Jitter within the window so same-day enrollments do not all fire at the
  // exact window-open instant.
  return new Date(slot.getTime() + Math.floor(Math.random() * 10 * 60_000));
}

export async function loadCampaignSteps(
  campaignId: string | null,
): Promise<CampaignStep[]> {
  if (!campaignId) return DEFAULT_CAMPAIGN_STEPS;
  const admin = createAdminClient();
  const { data } = await admin.from("campaigns").select("steps").eq("id", campaignId).maybeSingle();
  const cs = data?.steps as CampaignStep[] | null;
  return Array.isArray(cs) && cs.length ? cs : DEFAULT_CAMPAIGN_STEPS;
}

// Create the scheduled rows for a fresh enrollment. The first enabled step
// goes out at `startAt` (the contractor's choice: now, tomorrow morning, in
// 2 days, or any custom time); later steps keep the template's spacing
// relative to the first. Idempotent: steps that already have a row (any
// status) are left alone; the unique idempotency_key backstops a race.
export async function scheduleSequence(opts: {
  companyId: string;
  prospectId: string;
  steps: CampaignStep[];
  startAt: Date;
  testMode: boolean;
}): Promise<ScheduledStep[]> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("messages")
    .select("sequence_step")
    .eq("prospect_id", opts.prospectId)
    .eq("kind", "sequence");
  const have = new Set((existing ?? []).map((r) => r.sequence_step));

  const enabled = opts.steps.map((s, i) => ({ s, i })).filter(({ s }) => stepEnabled(s));
  if (!enabled.length) return [];
  const firstOffset = enabled[0].s.day_offset ?? 0;

  const rows = enabled
    .filter(({ i }) => !have.has(i))
    .map(({ s, i }) => ({
      company_id: opts.companyId,
      prospect_id: opts.prospectId,
      direction: "outbound",
      channel: "sms",
      kind: "sequence",
      status: "scheduled",
      scheduled_for: gapTime(opts.startAt, (s.day_offset ?? 0) - firstOffset, opts.testMode).toISOString(),
      sequence_step: i,
      step_intent: s.intent ?? null,
      step_template: s.template?.trim() || null,
      idempotency_key: touchKey(opts.prospectId, i),
    }));
  if (!rows.length) return [];

  const { error } = await admin.from("messages").insert(rows);
  if (error) {
    // Race with a concurrent enroll: retry row by row, ignoring duplicates.
    for (const r of rows) {
      const { error: e } = await admin.from("messages").insert(r);
      if (e && e.code !== "23505") throw new Error(e.message);
    }
  }
  // Read the rows back with ids (covers both insert paths) so callers can
  // reference individual touches (e.g. the confirmation screen's previews).
  const inserted = new Set(rows.map((r) => r.sequence_step));
  const { data: created } = await admin
    .from("messages")
    .select("id, sequence_step, scheduled_for")
    .eq("prospect_id", opts.prospectId)
    .eq("kind", "sequence")
    .eq("status", "scheduled")
    .order("sequence_step", { ascending: true });
  return (created ?? [])
    .filter((r) => inserted.has(r.sequence_step))
    .map((r) => ({ step: (r.sequence_step ?? 0) + 1, scheduledFor: r.scheduled_for, messageId: r.id }));
}

// Freeze: cancel this prospect's pending scheduled sends. Terminal statuses
// only ever transition scheduled -> canceled (append-only ledger).
export async function cancelScheduledForProspect(
  prospectId: string,
  reason: string,
  kinds: Array<"sequence" | "reminder"> = ["sequence"],
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("messages")
    .update({ status: "canceled", send_meta: { reason } })
    .eq("prospect_id", prospectId)
    .eq("status", "scheduled")
    .in("kind", kinds);
}

// Also used on STOP: kill pending reminders for the prospect(s).
export async function cancelPendingReminders(prospectId: string, reason: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("reminders")
    .update({ status: "canceled" })
    .eq("prospect_id", prospectId)
    .eq("status", "pending");
  await cancelScheduledForProspect(prospectId, reason, ["reminder"]);
}

// Resume: re-arm the remaining (never-sent) touches. Canceled rows flip back
// to scheduled with their spacing preserved relative to the first re-armed
// one; user-deleted touches stay deleted.
export async function rearmSequence(opts: {
  companyId: string;
  prospectId: string;
  testMode: boolean;
}): Promise<number> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("messages")
    .select("id, sequence_step, status, scheduled_for, send_meta")
    .eq("prospect_id", opts.prospectId)
    .eq("kind", "sequence")
    .eq("status", "canceled")
    .order("scheduled_for", { ascending: true });

  const rearmable = (existing ?? []).filter((r) => {
    const reason = (r.send_meta as { reason?: string } | null)?.reason;
    return reason !== "user_delete" && reason !== "user_skip";
  });
  if (!rearmable.length) return 0;

  // Preserve the original gaps between the remaining touches, restarted from
  // shortly after now.
  const firstOriginal = new Date(rearmable[0].scheduled_for ?? Date.now()).getTime();
  const base = Date.now() + 5 * 60 * 1000;
  let count = 0;
  for (const row of rearmable) {
    const gapMs = Math.max(0, new Date(row.scheduled_for ?? firstOriginal).getTime() - firstOriginal);
    const when = new Date(base + gapMs).toISOString();
    const { error } = await admin
      .from("messages")
      .update({ status: "scheduled", scheduled_for: when, send_meta: { reason: "resumed" } })
      .eq("id", row.id)
      .eq("status", "canceled");
    if (!error) count++;
  }
  return count;
}
