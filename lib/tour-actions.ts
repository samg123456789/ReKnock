"use server";

import { getActingCompany } from "@/lib/acting-company";

// Marks the one-time post-onboarding feature tour as seen for the acting
// company. The durable flag is the column (what the dashboard reads); the
// event row is kept for the audit trail. Returns whether the flag persisted
// so the client can retry instead of silently reappearing next login.
export async function markFeatureTourDone(): Promise<boolean> {
  const a = await getActingCompany();
  if (!a?.companyId) return false;
  const { error } = await a.client
    .from("companies")
    .update({ feature_tour_done_at: new Date().toISOString() })
    .eq("id", a.companyId);
  await a.client.from("events").insert({ company_id: a.companyId, type: "feature_tour_done" });
  return !error;
}
