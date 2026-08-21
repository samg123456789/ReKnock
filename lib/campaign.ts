// Canonical campaign step shape + the seeded 4-touch default. Shared by the
// sequence engine, the per-prospect draft preview, and the campaign editor so
// the schedule and intents never drift between them.

export type CampaignStep = {
  day_offset: number;
  preferred_time?: string; // HH:MM in the company's timezone; blank = best time
  intent?: string; // guidance for the AI drafter
  template?: string; // fixed copy; when set, used verbatim instead of AI draft
  enabled?: boolean; // toggled off = step skipped
};

export const DEFAULT_CAMPAIGN_STEPS: CampaignStep[] = [
  { day_offset: 2, preferred_time: "10:00", intent: "gentle check-in", enabled: true },
  { day_offset: 5, preferred_time: "10:00", intent: "value nudge", enabled: true },
  { day_offset: 10, preferred_time: "10:00", intent: "still interested", enabled: true },
  { day_offset: 20, preferred_time: "10:00", intent: "final courteous close", enabled: true },
];

// Preset intents offered in the editor. The stored intent value doubles as
// drafting guidance for the AI, so values stay lowercase prose; labels are
// what the contractor sees in the dropdown.
export const STEP_INTENT_OPTIONS: { value: string; label: string }[] = [
  { value: "gentle check-in", label: "Gentle check-in" },
  { value: "value nudge", label: "Value nudge" },
  { value: "answer questions / remove friction", label: "Answer their questions" },
  { value: "still interested", label: "Still interested?" },
  { value: "final courteous close", label: "Final courteous close" },
];

// Dropdown sentinel (never persisted): the contractor writes the exact
// message; the step's template is what sends, no AI drafting.
export const MANUAL_STEP_VALUE = "__manual__";
export const MANUAL_STEP_LABEL = "Manual - I'll write this one";

export function stepEnabled(s: CampaignStep): boolean {
  return s.enabled !== false;
}
