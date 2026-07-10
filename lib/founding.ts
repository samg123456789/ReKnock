import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { FOUNDING_LIMIT } from "@/lib/stripe";

export type FoundingStatus = { available: boolean; taken: number; spotsLeft: number };

// How many founding spots are used. A spot is taken once a company has been
// assigned the founding plan (set by the Stripe webhook from checkout metadata).
// Crosses tenants, so it uses the service-role client.
export async function foundingStatus(): Promise<FoundingStatus> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("plan", "founding");
  const taken = count ?? 0;
  return {
    available: taken < FOUNDING_LIMIT,
    taken,
    spotsLeft: Math.max(0, FOUNDING_LIMIT - taken),
  };
}
