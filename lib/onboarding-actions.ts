"use server";

import { redirect } from "next/navigation";
import { inngest } from "@/lib/inngest/client";
import { getActingCompany } from "@/lib/acting-company";
import { generateText, generateFromImages, parseJson, AI_MODEL, type InputImage } from "@/lib/ai";
import {
  buildVoiceProfilePrompt,
  VOICE_PROFILE_PROMPT_VERSION,
  type VoiceQuestionnaire,
  type VoiceProfileResult,
} from "@/lib/prompts/voice-profile";
import {
  buildWebsiteSummaryPrompt,
  WEBSITE_SUMMARY_PROMPT_VERSION,
  type WebsiteSummary,
} from "@/lib/prompts/website-summary";
import { buildTextOcrPrompt, type TextOcrResult } from "@/lib/prompts/text-ocr";
import { TRADE_VALUES } from "@/lib/trades";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireCompany() {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  if (!acting.companyId) throw new Error("No company for current user");
  const { data: company } = await acting.client
    .from("companies")
    .select("id, name, trade, description")
    .eq("id", acting.companyId)
    .maybeSingle();
  if (!company) throw new Error("No company for current user");
  return { supabase: acting.client, company };
}

// Step 1: company basics. Trades are multi-select; timezone moved to the
// sending-hours step. Website drives inference (see scrapeAndSummarize).
export async function saveCompanyBasics(input: {
  name: string;
  trades: string[];
  website: string;
  description: string;
  // Optional: only written when present. Onboarding saves these on their own
  // step (saveQuoteVolume); Settings still submits everything in one card.
  heard_about?: string;
  avg_quote_amount?: string;
  quotes_per_month?: string;
}): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Please enter your business name." };

  const trades = input.trades.filter((t) => TRADE_VALUES.includes(t as (typeof TRADE_VALUES)[number]));
  if (trades.length === 0) return { ok: false, error: "Please pick at least one trade." };

  const description = input.description.trim();
  const website = input.website.trim();
  if (!website && !description)
    return { ok: false, error: "Please add your website, or tell us what you do." };

  const update: Record<string, unknown> = {
    name,
    trades,
    trade: trades[0], // back-compat mirror
    website: website || null,
    description: description || null,
  };
  if (input.heard_about !== undefined) update.heard_about = input.heard_about.trim() || null;
  if (input.avg_quote_amount !== undefined) {
    const avg = input.avg_quote_amount.replace(/[^0-9.]/g, "");
    update.avg_quote_amount = avg ? Number(avg) : null;
  }
  if (input.quotes_per_month !== undefined) {
    const qpm = input.quotes_per_month.replace(/[^0-9]/g, "");
    update.quotes_per_month = qpm ? Number(qpm) : null;
  }

  const { supabase, company } = await requireCompany();
  const { error } = await supabase.from("companies").update(update).eq("id", company.id);
  if (error) return { ok: false, error: "Could not save. Please try again." };
  return { ok: true, data: undefined };
}

// Step 2: quote volume. Required; it tunes follow-up copy and the ROI math.
export async function saveQuoteVolume(input: {
  avg_quote_amount: string;
  quotes_per_month: string;
}): Promise<ActionResult> {
  const avg = input.avg_quote_amount.replace(/[^0-9.]/g, "");
  const qpm = input.quotes_per_month.replace(/[^0-9]/g, "");
  if (!avg || !Number(avg)) return { ok: false, error: "Roughly how big is a typical quote?" };
  if (!qpm || !Number(qpm)) return { ok: false, error: "About how many quotes do you send a month?" };

  const { supabase, company } = await requireCompany();
  const { error } = await supabase
    .from("companies")
    .update({ avg_quote_amount: Number(avg), quotes_per_month: Number(qpm) })
    .eq("id", company.id);
  if (error) return { ok: false, error: "Could not save. Please try again." };
  return { ok: true, data: undefined };
}

// Fetch a contractor's website and summarize it with Haiku. Best-effort: any
// failure returns null so onboarding is never blocked.
export async function scrapeAndSummarize(url: string): Promise<ActionResult<WebsiteSummary>> {
  let target = url.trim();
  if (!target) return { ok: false, error: "No website given." };
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  const { supabase, company } = await requireCompany();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(target, {
      signal: controller.signal,
      headers: { "user-agent": "ReKnock-Onboarding/1.0" },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!resp.ok) return { ok: false, error: "Could not read that site." };

    const html = await resp.text();
    const siteText = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);
    if (siteText.length < 40) return { ok: false, error: "That site had no readable text." };

    const { system, prompt, temperature, maxTokens } = buildWebsiteSummaryPrompt(target, siteText);
    const { text, usage } = await generateText({ system, prompt, temperature, maxTokens });
    const parsed = parseJson<WebsiteSummary>(text);
    if (!parsed) return { ok: false, error: "Could not summarize that site." };

    await supabase.from("events").insert({
      company_id: company.id,
      type: "ai.website_summarized",
      payload: {
        model: AI_MODEL,
        prompt_version: WEBSITE_SUMMARY_PROMPT_VERSION,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      },
    });
    const tradeGuess = Array.isArray(parsed.trade_guess)
      ? parsed.trade_guess.filter((t) => TRADE_VALUES.includes(t as (typeof TRADE_VALUES)[number]))
      : [];
    return { ok: true, data: { description: (parsed.description ?? "").trim(), trade_guess: tradeGuess } };
  } catch {
    await supabase.from("failed_jobs").insert({
      company_id: company.id,
      job_type: "website_summary",
      payload: { url: target },
      error: "fetch or summary failed",
    });
    return { ok: false, error: "Could not reach that site." };
  }
}

// Read screenshots of real text threads into the contractor's outgoing messages.
export async function ocrTextSamples(images: InputImage[]): Promise<ActionResult<string[]>> {
  if (!images.length) return { ok: false, error: "No images to read." };
  const { supabase, company } = await requireCompany();
  try {
    const { system, prompt, temperature, maxTokens } = buildTextOcrPrompt();
    const { text, usage } = await generateFromImages({ system, prompt, images, temperature, maxTokens });
    const parsed = parseJson<TextOcrResult>(text);
    if (!parsed || !Array.isArray(parsed.messages)) return { ok: false, error: "Could not read those screenshots." };
    await supabase.from("events").insert({
      company_id: company.id,
      type: "ai.text_samples_ocr",
      payload: { model: AI_MODEL, input_tokens: usage.inputTokens, output_tokens: usage.outputTokens },
    });
    return { ok: true, data: parsed.messages.map((m) => String(m).trim()).filter(Boolean).slice(0, 6) };
  } catch {
    await supabase.from("failed_jobs").insert({
      company_id: company.id,
      job_type: "text_samples_ocr",
      payload: { count: images.length },
      error: "vision call failed",
    });
    return { ok: false, error: "Could not read those screenshots. Try typing a sample instead." };
  }
}

// Step 3: generate the voice profile (does not persist; the contractor approves first).
export async function generateVoiceProfile(
  q: VoiceQuestionnaire,
): Promise<ActionResult<VoiceProfileResult>> {
  const { supabase, company } = await requireCompany();
  const { system, prompt, temperature, maxTokens } = buildVoiceProfilePrompt(
    { name: company.name ?? "", trade: company.trade ?? "", description: company.description ?? "" },
    q,
  );

  try {
    const { text, usage } = await generateText({ system, prompt, temperature, maxTokens });
    const parsed = parseJson<VoiceProfileResult>(text);
    if (!parsed || !parsed.master_prompt || !Array.isArray(parsed.samples)) {
      return { ok: false, error: "We could not read that back. Please try again." };
    }
    // Cost/quality tracking (CLAUDE.md section 4).
    await supabase.from("events").insert({
      company_id: company.id,
      type: "ai.voice_profile_generated",
      payload: {
        model: AI_MODEL,
        prompt_version: VOICE_PROFILE_PROMPT_VERSION,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      },
    });
    return { ok: true, data: { master_prompt: parsed.master_prompt.trim(), samples: parsed.samples.slice(0, 3) } };
  } catch {
    await supabase.from("failed_jobs").insert({
      company_id: company.id,
      job_type: "voice_profile_generation",
      payload: { prompt_version: VOICE_PROFILE_PROMPT_VERSION },
      error: "Anthropic call failed",
    });
    return { ok: false, error: "Our writer is busy. Please try again in a moment." };
  }
}

// Step 3 approve: persist the profile as the latest version (old versions kept).
export async function saveVoiceProfile(input: {
  questionnaire: VoiceQuestionnaire;
  masterPrompt: string;
  samples: string[];
}): Promise<ActionResult> {
  if (!input.masterPrompt.trim()) return { ok: false, error: "The voice profile is empty." };
  const { supabase, company } = await requireCompany();

  // Determine next version and demote the current latest.
  const { data: latest } = await supabase
    .from("voice_profiles")
    .select("version")
    .eq("company_id", company.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextVersion = (latest?.version ?? 0) + 1;

  await supabase.from("voice_profiles").update({ is_latest: false }).eq("company_id", company.id);

  const { error } = await supabase.from("voice_profiles").insert({
    company_id: company.id,
    questionnaire: input.questionnaire,
    master_prompt: input.masterPrompt.trim(),
    sample_messages: input.samples,
    version: nextVersion,
    is_latest: true,
  });
  if (error) return { ok: false, error: "Could not save your voice. Please try again." };
  return { ok: true, data: undefined };
}

// Step 4: sending schedule + timezone/market. Replaces the company's windows.
export async function saveSchedule(
  windows: { day_of_week: number; start_time: string; end_time: string; enabled: boolean }[],
  timezone: string,
): Promise<ActionResult> {
  const { supabase, company } = await requireCompany();
  if (timezone) {
    await supabase.from("companies").update({ timezone }).eq("id", company.id);
  }
  await supabase.from("sending_windows").delete().eq("company_id", company.id);
  const rows = windows.map((w) => ({ ...w, company_id: company.id }));
  const { error } = await supabase.from("sending_windows").insert(rows);
  if (error) return { ok: false, error: "Could not save your schedule. Please try again." };
  return { ok: true, data: undefined };
}

// Finish: seed the default 4-touch campaign (if none) and mark onboarding complete.
// heardAbout is the low-key optional question on the last screen.
// TODO: optional "finish setting up" reminder email for accounts that stall mid-wizard.
export async function finishOnboarding(heardAbout?: string, legalAccepted = false): Promise<ActionResult> {
  const { supabase, company } = await requireCompany();

  if (legalAccepted !== true) return { ok: false, error: "Please agree to the Terms and SMS Use Rules to finish setup." };

  // The number step is mandatory: nothing in the product can text without
  // one, so the dashboard is unreachable number-less no matter how this
  // action gets called.
  const { data: number } = await supabase
    .from("phone_numbers")
    .select("id")
    .eq("company_id", company.id)
    .neq("status", "released")
    .limit(1)
    .maybeSingle();
  if (!number) redirect("/onboarding");

  if (heardAbout?.trim()) {
    await supabase.from("companies").update({ heard_about: heardAbout.trim() }).eq("id", company.id);
  }

  await supabase.from("events").insert({
    company_id: company.id,
    type: "legal_terms_accepted",
    payload: {
      terms_version: "2026-08",
      source: "onboarding",
      accepted_at: new Date().toISOString(),
    },
  });

  const { data: existing } = await supabase
    .from("campaigns")
    .select("id")
    .eq("company_id", company.id)
    .eq("is_default", true)
    .maybeSingle();

  if (!existing) {
    await supabase.from("campaigns").insert({
      company_id: company.id,
      name: "Default follow-up",
      is_default: true,
      steps: [
        { day_offset: 2, intent: "gentle check-in", ai_personalize: true },
        { day_offset: 5, intent: "value nudge", ai_personalize: true },
        { day_offset: 10, intent: "still interested", ai_personalize: true },
        { day_offset: 20, intent: "final courteous close", ai_personalize: true },
      ],
    });
  }

  // First completion only: kick off the founder's onboarding email series
  // (the Inngest fn double-checks via an events marker, this is the fast gate).
  const { data: co } = await supabase.from("companies").select("onboarded_at").eq("id", company.id).maybeSingle();
  await supabase.from("companies").update({ onboarded_at: new Date().toISOString() }).eq("id", company.id);
  if (!co?.onboarded_at) {
    await inngest.send({ name: "company/onboarding.completed", data: { company_id: company.id } });
  }
  redirect("/app");
}
