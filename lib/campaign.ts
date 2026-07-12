// Canonical campaign step shape + the seeded 4-touch default. Shared by the
// sequence engine, the per-prospect draft preview, and the campaign editor so
// the schedule and intents never drift between them.

export type CampaignStep = {
  day_offset: number;
  intent?: string; // guidance for the AI drafter
  template?: string; // fixed copy; when set, used verbatim instead of AI draft
  enabled?: boolean; // toggled off = step skipped
};

export const DEFAULT_CAMPAIGN_STEPS: CampaignStep[] = [
  { day_offset: 2, intent: "gentle check-in", enabled: true },
  { day_offset: 5, intent: "value nudge", enabled: true },
  { day_offset: 10, intent: "still interested", enabled: true },
  { day_offset: 20, intent: "final courteous close", enabled: true },
];

// Preset intents offered in the editor (free text also allowed).
export const STEP_INTENT_PRESETS = [
  "gentle check-in",
  "value nudge",
  "answer questions / remove friction",
  "still interested",
  "final courteous close",
];

export function stepEnabled(s: CampaignStep): boolean {
  return s.enabled !== false;
}
