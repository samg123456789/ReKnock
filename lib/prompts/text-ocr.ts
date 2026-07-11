export const TEXT_OCR_PROMPT_VERSION = "text_ocr@1";

export type TextOcrResult = { messages: string[] };

const SYSTEM = `You read screenshots of real text-message conversations and extract only the messages the CONTRACTOR sent (the outgoing/right-side bubbles). Return only strict JSON, no code fences, no prose. Never invent text. If you are unsure who sent a message, leave it out.`;

export function buildTextOcrPrompt() {
  const prompt = `These images are screenshots of text threads between a contractor and their customers. Pull out the messages the contractor themselves sent (not the customer's replies, not timestamps, not UI labels).

Return JSON:
{
  "messages": ["each outgoing contractor message as plain text, verbatim"]
}

Return only the JSON.`;
  return { system: SYSTEM, prompt, temperature: 0.2, maxTokens: 800 };
}
