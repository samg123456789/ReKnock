// Shared follow-up schedule math. The inbox and dashboard both need to turn a
// campaign's day offsets + a quote/enrollment date + which steps already sent
// into upcoming touches. Kept in one place so the two surfaces never drift.

export type Step = { day_offset: number };
export type Touch = { step: number; date: string }; // date = YYYY-MM-DD

export const DEFAULT_STEPS: Step[] = [
  { day_offset: 2 },
  { day_offset: 5 },
  { day_offset: 10 },
  { day_offset: 20 },
];

// All not-yet-sent touches for a prospect, as {step, date}. `sentStepIdx` holds
// the 0-based indices already sent (derived from messages.sequence_step).
export function upcomingTouches(base: Date, steps: Step[], sentStepIdx: Set<number>): Touch[] {
  return steps
    .map((s, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + (s.day_offset ?? 0));
      return { step: i + 1, date: d.toISOString().slice(0, 10), idx: i };
    })
    .filter((t) => !sentStepIdx.has(t.idx))
    .map(({ step, date }) => ({ step, date }));
}

// The single next send for the dashboard "Next touch" column: the earliest
// unsent touch dated today or later. Null when the sequence is done/none left.
export function nextTouch(base: Date, steps: Step[], sentStepIdx: Set<number>): Touch | null {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = upcomingTouches(base, steps, sentStepIdx).filter((t) => t.date >= today);
  return upcoming[0] ?? null;
}
