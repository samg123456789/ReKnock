"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getActingCompany } from "@/lib/acting-company";
import { generateText } from "@/lib/ai";
import { buildFollowupDrafterPrompt, enforceCompliance, fillTemplate } from "@/lib/prompts/followup-drafter";
import { DEFAULT_CAMPAIGN_STEPS, type CampaignStep } from "@/lib/campaign";

export type CampaignResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
export type CampaignSummary = { id: string; name: string; is_default: boolean; steps: CampaignStep[] };

async function acting() {
  const a = await getActingCompany();
  if (!a) redirect("/login");
  if (!a.companyId) throw new Error("No company");
  return a;
}

function cleanSteps(raw: unknown): CampaignStep[] {
  if (!Array.isArray(raw)) return DEFAULT_CAMPAIGN_STEPS;
  const steps = raw
    .map((s) => {
      const o = (s ?? {}) as Record<string, unknown>;
      return {
        day_offset: Math.max(0, Math.min(365, Math.round(Number(o.day_offset ?? 0)) || 0)),
        preferred_time: typeof o.preferred_time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(o.preferred_time) ? o.preferred_time : undefined,
        intent: typeof o.intent === "string" ? o.intent.slice(0, 120) : "",
        template: typeof o.template === "string" ? o.template.slice(0, 320) : "",
        enabled: o.enabled !== false,
      };
    })
    .slice(0, 8);
  return steps.length ? steps : DEFAULT_CAMPAIGN_STEPS;
}

// The company's default campaign steps (seeds one if missing).
export async function getDefaultCampaign(): Promise<CampaignStep[]> {
  const a = await acting();
  const sb = a.client;
  const { data: c } = await sb.from("campaigns").select("id, steps").eq("company_id", a.companyId!).eq("is_default", true).maybeSingle();
  if (c) return cleanSteps(c.steps);
  await sb.from("campaigns").insert({ company_id: a.companyId!, name: "Default follow-up plan", is_default: true, steps: DEFAULT_CAMPAIGN_STEPS });
  return DEFAULT_CAMPAIGN_STEPS;
}

export async function getCampaigns(): Promise<CampaignSummary[]> {
  const a = await acting();
  const { data } = await a.client.from("campaigns").select("id, name, is_default, steps").eq("company_id", a.companyId!).order("is_default", { ascending: false }).order("created_at", { ascending: true });
  if (data?.length) return data.map((c) => ({ id: c.id as string, name: c.name as string, is_default: Boolean(c.is_default), steps: cleanSteps(c.steps) }));
  await getDefaultCampaign();
  const { data: seeded } = await a.client.from("campaigns").select("id, name, is_default, steps").eq("company_id", a.companyId!).order("is_default", { ascending: false });
  return (seeded ?? []).map((c) => ({ id: c.id as string, name: c.name as string, is_default: Boolean(c.is_default), steps: cleanSteps(c.steps) }));
}

export async function createCampaign(formData: FormData): Promise<void> {
  const a = await acting();
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!name) return;
  await a.client.from("campaigns").insert({ company_id: a.companyId!, name, is_default: false, steps: DEFAULT_CAMPAIGN_STEPS });
  revalidatePath("/campaign");
}

export async function saveCampaignSteps(campaignId: string, steps: CampaignStep[]): Promise<CampaignResult> {
  const a = await acting();
  const clean = cleanSteps(steps);
  if (!clean.some((s) => s.enabled !== false)) return { ok: false, error: "Keep at least one follow-up turned on." };
  const { error } = await a.client
    .from("campaigns")
    .update({ steps: clean, updated_at: new Date().toISOString() })
    .eq("company_id", a.companyId!)
    .eq("id", campaignId);
  if (error) return { ok: false, error: "Could not save your campaign." };
  return { ok: true, data: undefined };
}

// Sample message for one step, in the company voice, for a fictional homeowner.
// Lets the contractor see what each touch will sound like while editing.
export async function previewStepMessage(input: { intent: string; template: string; stepIndex: number; dayOffset: number }): Promise<CampaignResult<string>> {
  const a = await acting();
  const sb = a.client;
  const [{ data: co }, { data: voice }] = await Promise.all([
    sb.from("companies").select("name").eq("id", a.companyId!).maybeSingle(),
    sb.from("voice_profiles").select("master_prompt").eq("company_id", a.companyId!).eq("is_latest", true).maybeSingle(),
  ]);
  const businessName = co?.name ?? "your business";
  const isFirst = input.stepIndex === 0;
  const sample = { firstName: "Sarah", jobType: "roof replacement", quoteAmount: 8500, businessName };

  if (input.template.trim()) {
    return { ok: true, data: enforceCompliance(fillTemplate(input.template, sample), isFirst, businessName) };
  }
  const { system, prompt, temperature, maxTokens } = buildFollowupDrafterPrompt(
    voice?.master_prompt ?? "",
    { businessName, firstName: sample.firstName, jobType: sample.jobType, quoteAmount: sample.quoteAmount, daysSinceQuote: input.dayOffset },
    input.intent || "friendly follow-up",
    isFirst,
  );
  try {
    const { text } = await generateText({ system, prompt, temperature, maxTokens });
    return { ok: true, data: enforceCompliance(text, isFirst, businessName) };
  } catch {
    return { ok: false, error: "Could not draft a sample. Try again." };
  }
}
