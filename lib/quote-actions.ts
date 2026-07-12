"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { createAdminClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/admin";
import { generateText, generateFromMedia, parseJson, AI_MODEL, type MediaInput } from "@/lib/ai";
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_FILES } from "@/lib/quote-limits";
import { scheduleSequence } from "@/lib/enrollment";
import { DEFAULT_CAMPAIGN_STEPS, type CampaignStep } from "@/lib/campaign";
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
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  if (!acting.companyId) throw new Error("No company for current user");
  // When an admin is in view-as, `client` is the service-role client scoped to
  // the target company; otherwise it is the user's RLS client (own company).
  return { supabase: acting.client, company: { id: acting.companyId }, acting };
}

// Storage-backed intake. Files upload straight to the private `quotes` bucket
// via a signed upload URL so the bytes never go through a Server Action body
// (1MB Next limit / 4.5MB Vercel cap). Size ceilings live in lib/quote-limits.

// Mint a company-scoped signed upload URL. The path is derived server-side from
// the authenticated company, never trusted from the client.
export async function createQuoteUploadUrl(input: {
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ path: string; token: string }>> {
  const { company } = await requireCompany();
  const isPdf = input.contentType === "application/pdf";
  const isImage = input.contentType.startsWith("image/");
  if (!isPdf && !isImage)
    return { ok: false, error: "That file type is not supported. Upload a photo or PDF, or type the details in." };

  const max = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  if (input.sizeBytes > max) {
    const mb = Math.round(max / 1024 / 1024);
    return { ok: false, error: `That file is too big (max ${mb}MB). Try a smaller one, or paste/type the details instead.` };
  }

  const ext = isPdf ? "pdf" : input.contentType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png";
  const path = `${company.id}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from("quotes").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Upload could not start. Try again, or paste/type the details in." };
  return { ok: true, data: { path: data.path, token: data.token } };
}

// AI extraction from uploaded files (Storage paths) or pasted text. Never
// invents fields. Downloads objects server-side so no request-body limit applies.
export async function extractQuote(input: {
  paths?: string[];
  text?: string;
}): Promise<ActionResult<QuoteExtraction>> {
  const { supabase, company } = await requireCompany();
  const hasMedia = (input.paths?.length ?? 0) > 0;
  if (!hasMedia && !input.text?.trim()) return { ok: false, error: "Nothing to read." };

  try {
    let media: MediaInput[] | undefined;
    if (hasMedia) {
      const admin = createAdminClient();
      media = [];
      for (const p of input.paths!.slice(0, MAX_FILES)) {
        // Security: the object must live under this company's folder.
        if (!p.startsWith(`${company.id}/`)) continue;
        const { data: blob, error: dErr } = await admin.storage.from("quotes").download(p);
        if (dErr || !blob) continue;
        const mediaType = blob.type || (p.endsWith(".pdf") ? "application/pdf" : "image/png");
        const dataBase64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
        media.push({ mediaType, dataBase64 });
      }
      if (!media.length)
        return { ok: false, error: "We could not open that file. Paste the details or type them in." };
    }

    const { system, prompt, temperature, maxTokens } = buildQuoteExtractorPrompt(
      hasMedia ? undefined : input.text,
    );
    const { text, usage } = hasMedia
      ? await generateFromMedia({ system, prompt, media: media!, temperature, maxTokens })
      : await generateText({ system, prompt, temperature, maxTokens });
    const parsed = parseJson<QuoteExtraction>(text);
    if (!parsed) return { ok: false, error: "We could not read that. Try a clearer photo, or paste/type it in." };

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
  source: "manual" | "ocr_upload";
  storage_paths?: string[];
  extracted?: QuoteExtraction | null;
}): Promise<ActionResult<CreatedQuote>> {
  const firstName = input.first_name.trim();
  if (!firstName) return { ok: false, error: "Please enter the customer's first name." };

  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "Please enter a valid US phone number." };

  // 10DLC consent path is defaulted silently by source (never asked at intake):
  // manual + upload = verbal-at-quote. It stays editable on the prospect record.
  const consentPath = "verbal_at_quote";

  const amount = input.quote_amount.replace(/[^0-9.]/g, "");
  const quoteAmount = amount ? Number(amount) : null;
  const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(input.quote_date)
    ? input.quote_date
    : new Date().toISOString().slice(0, 10);

  const { supabase, company, acting } = await requireCompany();

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
      consent_path: consentPath,
      consent_captured_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !prospect) return { ok: false, error: "Could not save the quote. Please try again." };

  // Everything after the prospect insert is independent, so fan it out in
  // parallel (was a serial chain that delayed the "done" screen).
  const conf = input.extracted?.confidence
    ? Object.values(input.extracted.confidence).filter((n): n is number => typeof n === "number")
    : [];
  const avgConf = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null;

  // Enroll: write the scheduled `messages` rows the dispatcher will fire.
  // Off production runs in test mode (day offsets compressed to minutes).
  // Never fail the quote if scheduling hiccups.
  const steps = ((campaign?.steps as CampaignStep[] | null) ?? []).length
    ? (campaign!.steps as CampaignStep[])
    : DEFAULT_CAMPAIGN_STEPS;
  const base = new Date(`${quoteDate}T12:00:00Z`);
  const enroll = scheduleSequence({
    companyId: company.id,
    prospectId: prospect.id,
    steps,
    baseDate: base,
    testMode: process.env.VERCEL_ENV !== "production",
  }).catch(() =>
    supabase.from("failed_jobs").insert({
      company_id: company.id,
      job_type: "sequence_enroll",
      payload: { prospect_id: prospect.id },
      error: "scheduleSequence failed",
    }),
  );

  await Promise.all([
    // Persist the uploaded source file(s) as quote rows, linked to the
    // prospect, so the inbox can show/link the original photo or PDF later.
    input.storage_paths?.length
      ? supabase.from("quotes").insert(
          input.storage_paths.slice(0, MAX_FILES).map((p) => ({
            company_id: company.id,
            prospect_id: prospect.id,
            raw_source: p.endsWith(".pdf") ? "pdf" : "image",
            storage_path: p,
            extracted: input.extracted ?? null,
            ocr_confidence: avgConf,
          })),
        )
      : Promise.resolve(),
    supabase.from("events").insert({
      company_id: company.id,
      type: "prospect_created",
      payload: { prospect_id: prospect.id, source: input.source, consent_path: consentPath },
    }),
    enroll,
    acting.impersonating
      ? logAudit(acting.client, {
          actorUserId: acting.actorUserId,
          actorEmail: acting.actorEmail,
          action: "support_create_quote",
          targetCompanyId: company.id,
          metadata: { prospect_id: prospect.id },
        })
      : Promise.resolve(),
  ]);

  // Preview always shows the real-world cadence (days), even though dev test
  // mode compresses the actual scheduled rows to minutes.
  const touches: ScheduledTouch[] = steps
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.enabled !== false)
    .map(({ s, i }) => {
      const d = new Date(base);
      d.setDate(d.getDate() + (s.day_offset ?? 0));
      return { step: i + 1, dayOffset: s.day_offset ?? 0, date: d.toISOString().slice(0, 10) };
    });

  return { ok: true, data: { prospectId: prospect.id, firstName, touches } };
}
