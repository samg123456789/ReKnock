"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { createAdminClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/admin";
import { generateText, generateFromMedia, parseJson, AI_MODEL, type MediaInput } from "@/lib/ai";
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_FILES } from "@/lib/quote-limits";
import { scheduleSequence, computeStartAt, findActiveOptOut, type StartChoice } from "@/lib/enrollment";
import { CONSENT_ATTESTATION_VERSION } from "@/lib/consent";
import { DEFAULT_CAMPAIGN_STEPS, type CampaignStep } from "@/lib/campaign";
import {
  buildQuoteExtractorPrompt,
  QUOTE_EXTRACTOR_PROMPT_VERSION,
  type QuoteExtraction,
} from "@/lib/prompts/quote-extractor";
import { monthlyQuoteLimitMessage, monthlyQuoteUsage, notifyQuoteUsage } from "@/lib/quote-usage";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ScheduledTouch = { step: number; iso: string; messageId: string };
export type CreatedQuote = { prospectId: string; firstName: string; touches: ScheduledTouch[]; devCompressed: boolean };
// An existing prospect with the same phone: surfaced to the contractor before
// a second parallel sequence gets created (they can still start it on purpose).
export type DuplicateProspect = { id: string; name: string; jobType: string | null; status: string };
export type CreateQuoteResult =
  | { ok: true; data: CreatedQuote }
  | { ok: false; error: string; duplicate?: DuplicateProspect };

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
  start_choice?: StartChoice;
  start_custom_iso?: string;
  campaign_id?: string;
  allow_duplicate?: boolean;
  consent_attested?: boolean;
}): Promise<CreateQuoteResult> {
  const firstName = input.first_name.trim();
  if (!firstName) return { ok: false, error: "Please enter the customer's first name." };

  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "Please enter a valid US phone number." };

  // Consent attestation is a hard server-side gate, not just a UI checkbox:
  // we only ever record consent when the contractor actually confirmed it.
  if (input.consent_attested !== true)
    return { ok: false, error: "Please confirm this customer agreed to receive texts about their quote." };

  // 10DLC consent path is verbal-at-quote for manual + upload intake, now
  // backed by the required attestation above. It stays editable on the record.
  const consentPath = "verbal_at_quote";

  const amount = input.quote_amount.replace(/[^0-9.]/g, "");
  const quoteAmount = amount ? Number(amount) : null;
  const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(input.quote_date)
    ? input.quote_date
    : new Date().toISOString().slice(0, 10);

  const { supabase, company, acting } = await requireCompany();

  const usage = await monthlyQuoteUsage(supabase, company.id);
  if (usage.remaining < 1) return { ok: false, error: monthlyQuoteLimitMessage() };

  // Opt-out block (hard, not bypassable by allow_duplicate). If this homeowner
  // texted STOP to this contractor, they stay suppressed across every quote
  // until they text the contractor first. Checked at intake so no new sequence
  // is ever armed for a suppressed number.
  const optOut = await findActiveOptOut(supabase, company.id, phone);
  if (optOut.optedOut) {
    const since = optOut.since ? ` on ${new Date(optOut.since).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : "";
    return {
      ok: false,
      error: `This number opted out of your texts${since}. They'll need to text you first before you can start a new sequence.`,
    };
  }

  // Same-phone dedupe (mirrors the CSV import's check): a second quote for a
  // number already in the book means a second parallel sequence to the same
  // homeowner, so it needs an explicit go-ahead, never a silent double-add.
  if (!input.allow_duplicate) {
    const { data: dup } = await supabase
      .from("prospects")
      .select("id, first_name, last_name, job_type, status")
      .eq("company_id", company.id)
      .eq("phone_e164", phone)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dup) {
      return {
        ok: false,
        error: "You already have a quote for this phone number.",
        duplicate: {
          id: dup.id,
          name: `${dup.first_name ?? ""} ${dup.last_name ?? ""}`.trim() || "Unknown",
          jobType: dup.job_type,
          status: dup.status,
        },
      };
    }
  }

  const [{ data: campaign }, { data: co }, { data: windows }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, steps")
      .eq("company_id", company.id)
      .eq(input.campaign_id ? "id" : "is_default", input.campaign_id ?? true)
      .maybeSingle(),
    supabase.from("companies").select("timezone").eq("id", company.id).maybeSingle(),
    supabase.from("sending_windows").select("day_of_week, start_time, end_time, enabled").eq("company_id", company.id),
  ]);

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

  if (error?.message?.includes("monthly_quote_limit_reached")) {
    return { ok: false, error: monthlyQuoteLimitMessage() };
  }
  if (error || !prospect) return { ok: false, error: "Could not save the quote. Please try again." };

  await notifyQuoteUsage(company.id);

  // Everything after the prospect insert is independent, so fan it out in
  // parallel (was a serial chain that delayed the "done" screen).
  const conf = input.extracted?.confidence
    ? Object.values(input.extracted.confidence).filter((n): n is number => typeof n === "number")
    : [];
  const avgConf = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : null;

  // Enroll: write the scheduled `messages` rows the dispatcher will fire.
  // The first touch lands at the contractor's chosen start ("Start now" goes
  // out on the next dispatcher tick); later touches keep the template's
  // spacing. Off production runs in test mode (gaps compressed to minutes).
  // Never fail the quote if scheduling hiccups.
  const steps = ((campaign?.steps as CampaignStep[] | null) ?? []).length
    ? (campaign!.steps as CampaignStep[])
    : DEFAULT_CAMPAIGN_STEPS;
  const testMode = process.env.VERCEL_ENV !== "production";
  const startAt = computeStartAt({
    choice: input.start_choice ?? "recommended",
    customIso: input.start_custom_iso ?? null,
    tz: co?.timezone ?? "America/New_York",
    windows: windows ?? [],
    testMode,
  });
  let touches: ScheduledTouch[] = [];
  try {
    const scheduled = await scheduleSequence({
      companyId: company.id,
      prospectId: prospect.id,
      steps,
      startAt,
      testMode,
      timezone: co?.timezone ?? "America/New_York",
    });
    touches = scheduled.map((s) => ({ step: s.step, iso: s.scheduledFor, messageId: s.messageId }));
  } catch {
    await supabase.from("failed_jobs").insert({
      company_id: company.id,
      job_type: "sequence_enroll",
      payload: { prospect_id: prospect.id },
      error: "scheduleSequence failed",
    });
  }

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
      payload: {
        prospect_id: prospect.id,
        source: input.source,
        consent_path: consentPath,
        // Durable, per-number record of the contractor's consent attestation
        // (which version of the wording they confirmed) for dispute/A2P audit.
        consent_attested: true,
        consent_version: CONSENT_ATTESTATION_VERSION,
        start_choice: input.start_choice ?? "recommended",
      },
    }),
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

  // The preview shows the actual scheduled rows (real dates AND times), so
  // what the contractor sees is exactly what will fire.
  // The dashboard and inbox are server-rendered; without this, "Back to
  // dashboard" can serve the pre-creation page from the client router cache
  // and the new quote seems to have vanished.
  revalidatePath("/app");
  revalidatePath("/inbox");
  return { ok: true, data: { prospectId: prospect.id, firstName, touches, devCompressed: testMode } };
}
