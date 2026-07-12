"use server";

import { getActingCompany } from "@/lib/acting-company";

// Marks the one-time post-onboarding feature tour as seen for the acting
// company. Events are append-only and the dashboard reads with limit 1, so a
// rare double insert is harmless.
export async function markFeatureTourDone(): Promise<void> {
  const a = await getActingCompany();
  if (!a?.companyId) return;
  await a.client.from("events").insert({ company_id: a.companyId, type: "feature_tour_done" });
}
