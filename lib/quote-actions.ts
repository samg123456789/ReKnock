"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateText, generateFromMedia, parseJson, AI_MODEL, type MediaInput } from "@/lib/ai";
import {
  buildQuoteExtractorPrompt,
  QUOTE_EXTRACTOR_PROMPT_VERSION,
  type QuoteExtraction,
} from "@/lib/prompts/quote-extractor";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ScheduledTouch = { step: number; dayOffset: number; date: string };
export type CreatedQuote = { prospectId: string; firstName: string; touches: ScheduledTouch[] };

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}

async function requireCompany() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: company } = await supabase.from("companies").select("id").single();
  if (!company) throw new Error("No company for current user");
  return { supabase, company };
}

// AI extraction from images/PDF or pasted text. Never invents fields.
export async function extractQuote(input: {
  media?: MediaInput[];
  text?: string;
}): Promise<ActionResult<QuoteExtraction>> {
  const { supabase, company } = await requireCompany();
  const hasMedia = (input.media?.length ?? 0) > 0;
  if (!hasMedia && !input.text?.trim()) return { ok: false, error: "Nothing to read." };

  try {
    const { system, prompt, temperature, maxTokens } = buildQuoteExtractorPrompt(
      hasMedia ? undefined : input.text,
    );
    const { text, usage } = hasMedia
      ? await generateFromMedia({ system, prompt, media: input.media!, temperature, maxTokens })
      : await generateText({ system, prompt, temperature, maxTokens });
    const parsed = parseJson<QuoteExtraction>(text);
    if (!parsed) return { ok: false, error: "We could not read that. Try a clearer photo or type it in." };

    await supabase.from("events").insert({
      company_id: company.id,
      type: "ai.quote_extracted",
      payload: {
        model: AI_MODEL,
        prompt_version: QUOTE_EXTRACTOR_PROMPT_VERSION,
        source: hasMedia ? "media" : "text",
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      },
    });
    return { ok: true, data: parsed };
  } catch {
    await supabase.from("failed_jobs").insert({
      company_id: company.id,
      job_type: "quote_extraction",
      payload: { prompt_version: QUOTE_EXTRACTOR_PROMPT_VERSION },
      error: "extraction call failed",
    });
    return { ok: false, error: "Our reader is busy. Try again, or type the details in." };
  }
}

// Create the prospect + enroll, and return the scheduled touch preview.
export async function createQuote(input: {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  job_type: string;
  quote_amount: string;
  quote_date: string;
  consent_path: string;
  source: "manual" | "ocr_upload";
}): Promise<ActionResult<CreatedQuote>> {
  const firstName = input.first_name.trim();
  if (!firstName) return { ok: false, error: "Please enter the customer's first name." };

  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "Please enter a valid US phone number." };

  // 10DLC: we only message prospects with a recorded consent path.
  if (input.consent_path !== "verbal_at_quote" && input.consent_path !== "web_form")
    return { ok: false, error: "Please confirm how you got their OK to text." };

  const amount = input.quote_amount.replace(/[^0-9.]/g, "");
  const quoteAmount = amount ? Number(amount) : null;
  const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(input.quote_date)
    ? input.quote_date
    : new Date().toISOString().slice(0, 10);

  const { supabase, company } = await requireCompany();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, steps")
    .eq("company_id", company.id)
    .eq("is_default", true)
    .maybeSingle();

  const { data: prospect, error } = await supabase
    .from("prospects")
    .insert({
      company_id: company.id,
      first_name: firstName,
      last_name: input.last_name.trim() || null,
      phone_e164: phone,
      email: input.email.trim() || null,
      address: input.address.trim() || null,
      job_type: input.job_type.trim() || null,
      quote_amount: quoteAmount,
      quote_date: quoteDate,
      status: "sequencing",
      campaign_id: campaign?.id ?? null,
      source: input.source,
      consent_path: input.consent_path,
      consent_captured_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !prospect) return { ok: false, error: "Could not save the quote. Please try again." };

  await supabase.from("events").insert({
    company_id: company.id,
    type: "prospect_created",
    payload: { prospect_id: prospect.id, source: input.source, consent_path: input.consent_path },
  });

  const base = new Date(`${quoteDate}T12:00:00`);
  const steps = (campaign?.steps as { day_offset: number }[] | null) ?? [
    { day_offset: 2 },
    { day_offset: 5 },
    { day_offset: 10 },
    { day_offset: 20 },
  ];
  const touches: ScheduledTouch[] = steps.map((s, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + s.day_offset);
    return { step: i + 1, dayOffset: s.day_offset, date: d.toISOString().slice(0, 10) };
  });

  return { ok: true, data: { prospectId: prospect.id, firstName, touches } };
}
