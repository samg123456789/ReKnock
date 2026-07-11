"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { generateText, parseJson, AI_MODEL } from "@/lib/ai";
import {
  buildVoiceProfilePrompt,
  VOICE_PROFILE_PROMPT_VERSION,
  type VoiceQuestionnaire,
  type VoiceProfileResult,
} from "@/lib/prompts/voice-profile";
import { TRADE_VALUES } from "@/lib/trades";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireCompany() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: company } = await supabase
    .from("companies")
    .select("id, name, trade, description")
    .single();
  if (!company) throw new Error("No company for current user");
  return { supabase, company };
}

// Step 1: company basics.
export async function saveCompanyBasics(input: {
  name: string;
  trade: string;
  website: string;
  description: string;
  timezone: string;
}): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Please enter your business name." };
  if (!TRADE_VALUES.includes(input.trade as (typeof TRADE_VALUES)[number]))
    return { ok: false, error: "Please pick your trade." };

  const { supabase, company } = await requireCompany();
  const { error } = await supabase
    .from("companies")
    .update({
      name,
      trade: input.trade,
      website: input.website.trim() || null,
      description: input.description.trim() || null,
      timezone: input.timezone || "America/New_York",
    })
    .eq("id", company.id);
  if (error) return { ok: false, error: "Could not save. Please try again." };
  return { ok: true, data: undefined };
}

// Step 3: generate the voice profile (does not persist — the contractor approves first).
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

// Step 4: sending schedule. Replaces the company's windows with the seven given rows.
export async function saveSchedule(
  windows: { day_of_week: number; start_time: string; end_time: string; enabled: boolean }[],
): Promise<ActionResult> {
  const { supabase, company } = await requireCompany();
  await supabase.from("sending_windows").delete().eq("company_id", company.id);
  const rows = windows.map((w) => ({ ...w, company_id: company.id }));
  const { error } = await supabase.from("sending_windows").insert(rows);
  if (error) return { ok: false, error: "Could not save your schedule. Please try again." };
  return { ok: true, data: undefined };
}

// Finish: seed the default 4-touch campaign (if none) and mark onboarding complete.
export async function finishOnboarding(): Promise<void> {
  const { supabase, company } = await requireCompany();

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

  await supabase.from("companies").update({ onboarded_at: new Date().toISOString() }).eq("id", company.id);
  redirect("/app");
}
