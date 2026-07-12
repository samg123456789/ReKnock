// Versioned prompt: voice profile + prospect context + step intent -> one SMS.
// CLAUDE.md section 4 (followup_drafter) + SMS compliance.
export const FOLLOWUP_DRAFTER_PROMPT_VERSION = "followup_drafter@1";

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
    .replace(/\{amount\}/gi, v.quoteAmount != null ? `$${v.quoteAmount}` : "")
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
${isFirstTouch ? `- This is the FIRST message, so it MUST identify the business ("${ctx.businessName}") and end with exactly: Reply STOP to opt out.` : "- Do not repeat the full business intro; this is a later follow-up."}
Return ONLY the message text, nothing else.`;

  const prompt = `Homeowner first name: ${ctx.firstName}
Job: ${ctx.jobType ?? "their project"}
${ctx.quoteAmount ? `Quote amount: $${ctx.quoteAmount}` : ""}
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
    if (!/reply stop/i.test(t)) t = `${t} Reply STOP to opt out.`;
    // Carrier-registered phrase is exact-cased; normalize whatever casing the
    // model produced (a lowercase voice writes "reply stop to opt out").
    t = t.replace(/reply stop to opt out\.?/i, "Reply STOP to opt out.");
    if (businessName && !t.toLowerCase().includes(businessName.toLowerCase().slice(0, 12))) {
      t = `${businessName}: ${t}`;
    }
  }
  if (t.length > 320) t = t.slice(0, 317).trimEnd() + "...";
  return t;
}
