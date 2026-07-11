// Versioned prompt: inbound SMS -> intent + confidence. CLAUDE.md section 4 +
// invariant 8 (bias toward interested/question; low confidence => freeze + ping).
export const REPLY_CLASSIFIER_PROMPT_VERSION = "reply_classifier@1";

export type ReplyIntent = "interested" | "question" | "reschedule" | "not_now" | "lost" | "opt_out" | "other";

export type ReplyClassification = {
  intent: ReplyIntent;
  confidence: number;
  reschedule_hint: string | null; // e.g. "spring", "next month", a date, or null
};

const SYSTEM = `You classify a homeowner's text reply to a contractor's quote follow-up. Return only strict JSON, no code fences.

Intents: interested, question, reschedule, not_now, lost, opt_out, other.
- Misrouting a hot lead to "lost" or "not_now" is the worst possible error. When unsure between a warm read and a cold one, choose interested or question.
- reschedule = they want to be contacted later ("not until spring", "call me next month"); capture the timing in reschedule_hint.
- Only use opt_out for an explicit stop request.
- confidence is 0 to 1 for your chosen intent.`;

export function buildReplyClassifierPrompt(body: string, priorContext?: string) {
  const prompt = `${priorContext ? `Context: ${priorContext}\n` : ""}Homeowner reply: """${body}"""

Return JSON: {"intent": one of the intents, "confidence": 0-1, "reschedule_hint": string or null}. Only JSON.`;
  return { system: SYSTEM, prompt, temperature: 0.2, maxTokens: 200 };
}
