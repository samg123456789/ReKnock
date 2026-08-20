import { formatMoney } from "@/lib/format";

// Versioned prompt: voice profile + prospect context + step intent -> one SMS.
// CLAUDE.md section 4 (followup_drafter) + SMS compliance.
// @2: founder tone directive - conversational, references the prior
// conversation, one question, never leads with the raw price number.
export const FOLLOWUP_DRAFTER_PROMPT_VERSION = "followup_drafter@2";
export const STOP_LINE = "Reply STOP to opt out.";
export const FIRST_TOUCH_DISCLOSURE_LINE = "Message and data rates may apply.\nReply STOP to opt out.";

export type FollowupContext = {
  businessName: string;
  firstName: string;
  jobType: string | null;
  quoteAmount: number | null;
  daysSinceQuote: number;
  notes?: string | null;
};

// Fill {first_name}/{job}/{amount}/{business} placeholders in a fixed template
// (used when a campaign step or a per-prospect override supplies exact copy).
export function fillTemplate(
  t: string,
  v: { firstName: string; jobType: string | null; quoteAmount: number | null; businessName: string },
): string {
  return t
    .replace(/\{first_?name\}/gi, v.firstName)
    .replace(/\{job(_?type)?\}/gi, v.jobType ?? "your project")
    .replace(/\{amount\}/gi, formatMoney(v.quoteAmount))
    .replace(/\{business(_?name)?\}/gi, v.businessName);
}

export function buildFollowupDrafterPrompt(
  voiceMasterPrompt: string,
  ctx: FollowupContext,
  stepIntent: string,
  isFirstTouch: boolean,
) {
  const system = `${voiceMasterPrompt}

You are writing ONE text message to a homeowner about an open quote. Hard rules:
- Under 320 characters including the disclosure line.
- Never use an em-dash. Never include a link or URL. A phone number is fine.
- No pushy language, no invented prices/discounts/material claims.
- Sound like the contractor above, not a marketer.
- Write like a person following up on a conversation you already had, not an announcement. Never open with the quote amount or restate the full price; they already have the quote.
${isFirstTouch ? `- This is the FIRST message: say who is texting (the contractor and the business "${ctx.businessName}"), say the follow-up is sent through ReKnock, reference the job you spoke about, and ask ONE simple question about whether they want to move forward. Match this shape in the contractor's own voice, not these exact words: "Hey Jon - it's Sam from Apex Roofing through ReKnock, texting you about the kitchen remodel we spoke about. Have you given any more thought if you wanted to proceed?" It MUST end with exactly: ${FIRST_TOUCH_DISCLOSURE_LINE}` : "- Do not repeat the full business intro; this is a later follow-up."}
Return ONLY the message text, nothing else.`;

  const prompt = `Homeowner first name: ${ctx.firstName}
Job: ${ctx.jobType ?? "their project"}
${ctx.quoteAmount ? `Quote amount (context only, do not lead with it): ${formatMoney(ctx.quoteAmount)}` : ""}
Days since the quote: ${ctx.daysSinceQuote}
${ctx.notes?.trim() ? `What the contractor knows about this customer (use it naturally if relevant, never quote it back verbatim): ${ctx.notes.trim()}` : ""}
This message's intent: ${stepIntent}

Write the single text now.`;

  return { system, prompt, temperature: 0.7, maxTokens: 200 };
}

// Standing disclosure rule: every homeowner-facing outbound message gets one
// opt-out line, and the first homeowner-facing message also gets the carrier
// fee disclosure. These lines are hardcoded at the send boundary; any inline
// copy from the model, a template, or the contractor is stripped first.
export function appendStopLine(text: string, includeRates = false): string {
  const hadRates = /(?:msg|message)\s*(?:&|and)\s*data rates may apply\.?/i.test(text);
  const t = text
    .replace(/\s*(?:msg|message)\s*(?:&|and)\s*data rates may apply\.?/gi, "")
    .replace(/\s*reply stop to (?:opt out|unsubscribe)\.?/gi, "")
    .trim();
  const line = includeRates || hadRates ? FIRST_TOUCH_DISCLOSURE_LINE : STOP_LINE;
  return `${t}\n\n${line}`;
}

// Enforce the non-negotiable compliance rules regardless of model output.
// Identification (business name) stays first-touch-only.
export function enforceCompliance(text: string, isFirstTouch: boolean, businessName: string): string {
  let t = text.trim().replace(/^["']|["']$/g, "");
  t = t.replace(/https?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "").replace(/\s{2,}/g, " ").trim();
  t = t.replace(/—/g, " "); // strip em-dashes
  t = t
    .replace(/\s*(?:msg|message)\s*(?:&|and)\s*data rates may apply\.?/gi, "")
    .replace(/\s*reply stop to (?:opt out|unsubscribe)\.?/gi, "")
    .trim();
  if (isFirstTouch && businessName && !t.toLowerCase().includes(businessName.toLowerCase().slice(0, 12))) {
    t = `${businessName}: ${t}`;
  }
  if (isFirstTouch && !t.toLowerCase().includes("reknock")) {
    t = `ReKnock for ${businessName}: ${t}`;
  }
  const maxBody = isFirstTouch ? 250 : 290;
  if (t.length > maxBody) t = t.slice(0, maxBody - 3).trimEnd() + "...";
  return appendStopLine(t, isFirstTouch);
}
