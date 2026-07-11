// Versioned prompt: questionnaire + company info -> master voice prompt + 3 samples.
// CLAUDE.md section 4 (voice_profile_builder). Bump VERSION on any wording change
// so cost/quality can be tracked per version in the events log.

export const VOICE_PROFILE_PROMPT_VERSION = "voice_profile_builder@1";

export type VoiceQuestionnaire = {
  texting_style: "short_casual" | "friendly_chatty" | "professional_brief";
  uses_first_name: boolean;
  uses_emojis: boolean;
  uses_exclamation: boolean;
  sign_off: string;
  sample_texts: string; // real texts the contractor pasted (may be empty)
  never_say: string; // things they would never say (may be empty)
};

export type VoiceProfileResult = {
  master_prompt: string;
  samples: string[];
};

export type CompanyContext = {
  name: string;
  trade: string;
  description: string;
};

const STYLE_LABEL: Record<VoiceQuestionnaire["texting_style"], string> = {
  short_casual: "short and casual",
  friendly_chatty: "friendly and chatty",
  professional_brief: "professional and brief",
};

const SYSTEM = `You build "voice profiles" for ReKnock, a tool that sends quote follow-up texts to homeowners on behalf of a contractor. Your job is to capture exactly how one contractor texts, so future messages sound like the contractor wrote them.

You return only strict JSON. No prose before or after, no code fences.

Hard rules that MUST appear as instructions inside the master_prompt, and that the sample texts MUST follow:
- Never use em-dashes anywhere. Use a period or the word "to" instead.
- Keep every text under 320 characters.
- Never invent prices, discounts, warranties, or claims about materials or timelines. Only reference what the contractor actually said.
- Never sound like a robot or a marketer. Sound like a real person texting from a job site.
- Always match the contractor's tone, punctuation, emoji use, and sign-off exactly as described.`;

export function buildVoiceProfilePrompt(
  company: CompanyContext,
  q: VoiceQuestionnaire,
): { system: string; prompt: string; temperature: number; maxTokens: number } {
  const prompt = `Here is the contractor.

Business: ${company.name || "(not given)"}
Trade: ${company.trade || "(not given)"}
What they do: ${company.description || "(not given)"}

How they text customers: ${STYLE_LABEL[q.texting_style]}
Uses the customer's first name: ${q.uses_first_name ? "yes" : "no"}
Uses emojis: ${q.uses_emojis ? "yes" : "no"}
Uses exclamation points: ${q.uses_exclamation ? "yes" : "no"}
Signs off with: ${q.sign_off || "(no sign-off)"}
Real texts they have sent (mimic this voice):
${q.sample_texts?.trim() || "(none provided)"}
Things they would never say: ${q.never_say?.trim() || "(none given)"}

Produce JSON with exactly these keys:
{
  "master_prompt": "A 150 to 300 word instruction, written in the second person ('You are texting as ...'), that tells a writer exactly how to text as this contractor: tone, sentence length, punctuation, emoji use, greeting style, sign-off, vocabulary, and the hard rules above. It must be specific to this contractor, not generic.",
  "samples": ["three example follow-up texts to a homeowner about an open quote, each in this contractor's voice, each under 320 characters, no em-dashes"]
}

Return only the JSON.`;

  return { system: SYSTEM, prompt, temperature: 0.7, maxTokens: 1200 };
}
