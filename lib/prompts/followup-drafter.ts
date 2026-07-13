import { formatMoney } from "@/lib/format";

// Versioned prompt: voice profile + prospect context + step intent -> one SMS.
// CLAUDE.md section 4 (followup_drafter) + SMS compliance.
// @2: founder tone directive - conversational, references the prior
// conversation, one question, never leads with the raw price number.
export const FOLLOWUP_DRAFTER_PROMPT_VERSION = "followup_drafter@2";

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
- Under 320 characters.
- Never use an em-dash. Never include a link or URL. A phone number is fine.
- No pushy language, no invented prices/discounts/material claims.
- Sound like the contractor above, not a marketer.
- Write like a person following up on a conversation you already had, not an announcement. Never open with the quote amount or restate the full price; they already have the quote.
${isFirstTouch ? `- This is the FIRST message: say who is texting (the contractor and the business "${ctx.businessName}"), reference the job you spoke about, and ask ONE simple question about whether they want to move forward. Match this shape in the contractor's own voice, not these exact words: "Hey Jon - it's Sam from Apex Roofing, texting you about the kitchen remodel we spoke about. Have you given any more thought if you wanted to proceed?" It MUST end with exactly: Reply STOP to opt out.` : "- Do not repeat the full business intro; this is a later follow-up."}
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

// Enforce the non-negotiable compliance rules regardless of model output.
export function enforceCompliance(text: string, isFirstTouch: boolean, businessName: string): string {
  let t = text.trim().replace(/^["']|["']$/g, "");
  t = t.replace(/https?:\/\/\S+/gi, "").replace(/\bwww\.\S+/gi, "").replace(/\s{2,}/g, " ").trim();
  t = t.replace(/—/g, " "); // strip em-dashes
  if (isFirstTouch) {
    // The opt-out goes on its own line, blank-line separated from the message
    // body (founder directive), in the carrier-registered exact casing. Strip
    // any version the model wrote inline first.
    t = t.replace(/\s*reply stop to opt out\.?/gi, "").trim();
    if (businessName && !t.toLowerCase().includes(businessName.toLowerCase().slice(0, 12))) {
      t = `${businessName}: ${t}`;
    }
    if (t.length > 290) t = t.slice(0, 287).trimEnd() + "...";
    t = `${t}\n\nReply STOP to opt out`;
  } else if (t.length > 320) {
    t = t.slice(0, 317).trimEnd() + "...";
  }
  return t;
}
