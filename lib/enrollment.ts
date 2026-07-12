import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { DEFAULT_CAMPAIGN_STEPS, stepEnabled, type CampaignStep } from "@/lib/campaign";

// The scheduled-send primitive. Every future automated send is a `messages`
// row with status='scheduled' + scheduled_for; the Inngest dispatcher fires
// them and re-checks status/opt-out/cap/window at send time. Enroll, freeze
// (cancel), and Resume (re-arm) all operate on those rows.

export type ScheduledStep = { step: number; scheduledFor: string };

export function touchKey(prospectId: string, stepIndex: number): string {
  return `touch:${prospectId}:${stepIndex}`;
}

// Off production, day offsets compress to minutes so a full sequence can be
// watched end to end. Same rule the old engine used.
function stepTime(base: Date, dayOffset: number, testMode: boolean): Date {
  const d = new Date(base);
  if (testMode) d.setMinutes(d.getMinutes() + dayOffset);
  else d.setDate(d.getDate() + dayOffset);
  return d;
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

// Create the scheduled rows for a fresh enrollment. Idempotent: steps that
// already have a row (any status) are left alone, so a double-enroll can
// never double-schedule (unique idempotency_key backstops a race).
export async function scheduleSequence(opts: {
  companyId: string;
  prospectId: string;
  steps: CampaignStep[];
  baseDate: Date;
  testMode: boolean;
}): Promise<ScheduledStep[]> {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("messages")
    .select("sequence_step")
    .eq("prospect_id", opts.prospectId)
    .eq("kind", "sequence");
  const have = new Set((existing ?? []).map((r) => r.sequence_step));

  const rows = opts.steps
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => stepEnabled(s) && !have.has(i))
    .map(({ s, i }) => ({
      company_id: opts.companyId,
      prospect_id: opts.prospectId,
      direction: "outbound",
      channel: "sms",
      kind: "sequence",
      status: "scheduled",
      scheduled_for: stepTime(opts.baseDate, s.day_offset ?? 0, opts.testMode).toISOString(),
      sequence_step: i,
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
  return rows.map((r) => ({ step: (r.sequence_step ?? 0) + 1, scheduledFor: r.scheduled_for }));
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

// Resume: re-arm the remaining (never-sent) steps. Canceled rows flip back to
// scheduled; missing rows are inserted. Times restart from now, preserving the
// campaign's cadence between the remaining steps.
export async function rearmSequence(opts: {
  companyId: string;
  prospectId: string;
  testMode: boolean;
}): Promise<number> {
  const admin = createAdminClient();
  const { data: prospect } = await admin
    .from("prospects")
    .select("campaign_id")
    .eq("id", opts.prospectId)
    .maybeSingle();
  const steps = await loadCampaignSteps(prospect?.campaign_id ?? null);

  const { data: existing } = await admin
    .from("messages")
    .select("id, sequence_step, status")
    .eq("prospect_id", opts.prospectId)
    .eq("kind", "sequence");
  const byStep = new Map((existing ?? []).map((r) => [r.sequence_step, r]));

  const remaining = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => {
      if (!stepEnabled(s)) return false;
      const row = byStep.get(i);
      return !row || row.status === "canceled";
    });
  if (!remaining.length) return 0;

  // First remaining step goes out shortly after resume; later ones keep their
  // original spacing relative to it.
  const firstOffset = remaining[0].s.day_offset ?? 0;
  const base = new Date(Date.now() + 5 * 60 * 1000);
  let count = 0;
  for (const { s, i } of remaining) {
    const when = stepTime(base, (s.day_offset ?? 0) - firstOffset, opts.testMode).toISOString();
    const row = byStep.get(i);
    if (row) {
      const { error } = await admin
        .from("messages")
        .update({ status: "scheduled", scheduled_for: when, send_meta: { reason: "resumed" } })
        .eq("id", row.id)
        .eq("status", "canceled");
      if (!error) count++;
    } else {
      const { error } = await admin.from("messages").insert({
        company_id: opts.companyId,
        prospect_id: opts.prospectId,
        direction: "outbound",
        channel: "sms",
        kind: "sequence",
        status: "scheduled",
        scheduled_for: when,
        sequence_step: i,
        idempotency_key: touchKey(opts.prospectId, i),
      });
      if (!error) count++;
    }
  }
  return count;
}
