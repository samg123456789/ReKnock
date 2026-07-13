"use server";

import { getActingCompany } from "@/lib/acting-company";

// Persist first-touch attribution (UTM/ref cookie) onto the company, once.
// Called from the onboarding wizard's first render after signup. Write-once:
// an existing signup_source is never overwritten, and a company can never be
// credited to its own referral code.
export async function captureAttribution(raw: string): Promise<void> {
  let data: Record<string, string>;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return;

  const a = await getActingCompany();
  if (!a?.companyId) return;

  const { data: co } = await a.client
    .from("companies")
    .select("signup_source, referred_by_code, referral_code")
    .eq("id", a.companyId)
    .maybeSingle();
  if (!co || co.signup_source) return;

  const clean: Record<string, string> = {};
  for (const k of ["ref", "utm_source", "utm_medium", "utm_campaign", "utm_content", "referrer", "landing", "ts"]) {
    if (typeof data[k] === "string") clean[k] = data[k].slice(0, 300);
  }
  if (Object.keys(clean).length === 0) return;

  const update: Record<string, unknown> = { signup_source: clean };
  if (clean.ref && !co.referred_by_code && clean.ref !== co.referral_code) {
    update.referred_by_code = clean.ref;
  }
  await a.client.from("companies").update(update).eq("id", a.companyId);
  await a.client.from("events").insert({ company_id: a.companyId, type: "signup_attributed", payload: clean });
}
