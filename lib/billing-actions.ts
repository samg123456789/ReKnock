"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getStripe,
  priceIdForLookup,
  planLookup,
  LOOKUP,
  type Interval,
  type Tier,
} from "@/lib/stripe";
import { foundingStatus } from "@/lib/founding";
import { siteOrigin } from "@/lib/site-url";

const INTERVALS: Interval[] = ["monthly", "annual"];

async function loadUserAndCompany() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: company } = await supabase
    .from("companies")
    .select("id, stripe_customer_id")
    .single();

  return { supabase, user, company };
}

// Start Stripe Checkout. The tier (founding vs standard) is decided by the
// server from remaining founding spots, never by the user; the user only picks
// the billing interval. Charges $1 up front (one-time) and puts the plan on a
// 7-day trial, so week one costs a dollar regardless of monthly/annual. Card
// required. Stripe is the source of truth; the webhook mirrors status onto
// companies.
export async function createCheckoutSession(interval: Interval) {
  if (!INTERVALS.includes(interval)) throw new Error(`Unknown interval: ${interval}`);
  const origin = await siteOrigin();
  const { supabase, user, company } = await loadUserAndCompany();
  if (!company) throw new Error("No company for user");

  const { available } = await foundingStatus();
  const tier: Tier = available ? "founding" : "standard";

  const [planPrice, trialPrice] = await Promise.all([
    priceIdForLookup(planLookup(tier, interval)),
    priceIdForLookup(LOOKUP.trial),
  ]);

  let customerId = company.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email ?? undefined,
      metadata: { company_id: company.id },
    });
    customerId = customer.id;
    await supabase.from("companies").update({ stripe_customer_id: customerId }).eq("id", company.id);
  }

  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: company.id,
    line_items: [
      { price: planPrice, quantity: 1 },
      { price: trialPrice, quantity: 1 }, // one-time $1 up front
    ],
    subscription_data: {
      trial_period_days: 7,
      metadata: { company_id: company.id, plan: tier, interval },
    },
    metadata: { company_id: company.id, plan: tier, interval },
    success_url: `${origin}/onboarding?checkout=success`,
    cancel_url: `${origin}/checkout?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  redirect(session.url);
}

// Stripe Customer Portal for managing billing (CLAUDE.md: no custom billing UI).
export async function createBillingPortalSession() {
  const origin = await siteOrigin();
  const { company } = await loadUserAndCompany();
  const customerId = company?.stripe_customer_id as string | null;
  if (!customerId) redirect("/checkout");

  const portal = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/settings`,
  });
  redirect(portal.url);
}
