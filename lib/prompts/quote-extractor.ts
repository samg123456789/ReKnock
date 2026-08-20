// Versioned prompt: quote email/photo/PDF/screenshot/text -> strict JSON fields
// with per-field confidence. CLAUDE.md section 4 (quote_extractor).
// MUST return valid JSON only and MUST NEVER invent a phone number.

export const QUOTE_EXTRACTOR_PROMPT_VERSION = "quote_extractor@1";

export type QuoteFields = {
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  job_type: string | null;
  quote_amount: number | null;
  quote_date: string | null; // YYYY-MM-DD
};

export type QuoteExtraction = QuoteFields & {
  confidence: Partial<Record<keyof QuoteFields, number>>;
};

const SYSTEM = `You extract the customer and quote details a contractor needs to follow up, from a quote document, photo, screenshot, or pasted text.

Return only strict JSON, no code fences, no prose.

Rules:
- NEVER invent a phone number, email, or any value. If it is not clearly present, use null and confidence 0.
- Phone: only a real number that appears in the source. Normalize to digits you see; do not guess area codes.
- quote_amount: the total the contractor quoted, as a plain number (no $ or commas), or null.
- quote_date: the date on the quote in YYYY-MM-DD, or null if absent.
- job_type: a short phrase like "roof replacement" or "kitchen remodel".
- Give a confidence 0 to 1 for each field reflecting how sure you are it is correct.`;

export function buildQuoteExtractorPrompt(pastedText?: string) {
  const prompt = `${pastedText ? `Source text:\n"""\n${pastedText}\n"""\n\n` : "The attached image(s)/document is a contractor's quote or a message about one.\n\n"}Return JSON exactly:
{
  "first_name": string|null,
  "last_name": string|null,
  "phone": string|null,
  "email": string|null,
  "address": string|null,
  "job_type": string|null,
  "quote_amount": number|null,
  "quote_date": string|null,
  "confidence": { "first_name": 0-1, "last_name": 0-1, "phone": 0-1, "email": 0-1, "address": 0-1, "job_type": 0-1, "quote_amount": 0-1, "quote_date": 0-1 }
}

Return only the JSON.`;
  return { system: SYSTEM, prompt, temperature: 0.2, maxTokens: 800 };
}
