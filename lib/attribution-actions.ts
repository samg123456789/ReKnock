"use server";

import { getActingCompany } from "@/lib/acting-company";

// Persist first-touch attribution (UTM cookie) onto the company, once.
// Called from the onboarding wizard's first render after signup. Write-once:
// an existing signup_source is never overwritten.
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
    .select("signup_source")
    .eq("id", a.companyId)
    .maybeSingle();
  if (!co || co.signup_source) return;

  const clean: Record<string, string> = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "referrer", "landing", "ts"]) {
    if (typeof data[k] === "string") clean[k] = data[k].slice(0, 300);
  }
  if (Object.keys(clean).length === 0) return;

  await a.client.from("companies").update({ signup_source: clean }).eq("id", a.companyId);
  await a.client.from("events").insert({ company_id: a.companyId, type: "signup_attributed", payload: clean });
}
