import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";

// Single place the model is named, so it is swappable (CLAUDE.md section 1).
// Verified against the model catalog: claude-haiku-4-5 (200K context) is the
// current Haiku. It does not support adaptive thinking/effort, so we steer with
// temperature only (low for extraction/classification, moderate for drafting).
export const AI_MODEL = "claude-haiku-4-5";

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  // The SDK auto-retries 429/5xx with backoff (default 2 retries) — satisfies
  // the retry requirement in ground rule 11; callers log failures to failed_jobs.
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey() });
  return _client;
}

export type AiUsage = { inputTokens: number; outputTokens: number };

export async function generateText(opts: {
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; usage: AiUsage }> {
  const res = await anthropic().messages.create({
    model: AI_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content: opts.prompt }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    text,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}

export type InputImage = { mediaType: string; dataBase64: string };

// Vision call: images + a prompt. Haiku 4.5 supports image input. Reused for
// onboarding text-screenshot OCR now and quote OCR in Phase 4.
export async function generateFromImages(opts: {
  system?: string;
  prompt: string;
  images: InputImage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ text: string; usage: AiUsage }> {
  const content: Anthropic.ContentBlockParam[] = [
    ...opts.images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: img.dataBase64,
        },
      }),
    ),
    { type: "text", text: opts.prompt },
  ];
  const res = await anthropic().messages.create({
    model: AI_MODEL,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.3,
    ...(opts.system ? { system: opts.system } : {}),
    messages: [{ role: "user", content }],
  });
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return {
    text,
    usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
  };
}

// Pull the first JSON object/array out of a model response, tolerating code
// fences and leading prose. Returns null if nothing parses.
export function parseJson<T>(text: string): T | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[[{]/);
  if (start > 0) s = s.slice(start);
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
