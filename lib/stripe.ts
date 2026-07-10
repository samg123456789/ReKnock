import Stripe from "stripe";
import { env } from "@/lib/env";

// Lazy so a missing key fails at call time (in a route), never at build.
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.stripeSecretKey());
  return _stripe;
}

// Plans a customer can pick at checkout. Price ids come from env, populated by
// scripts/stripe-setup.mjs (which creates them in Stripe with these lookup_keys).
export type PlanKey = "founding" | "standard" | "annual";

export const PLANS: Record<
  PlanKey,
  { label: string; blurb: string; priceEnv: string; lookupKey: string }
> = {
  founding: {
    label: "Founding member",
    blurb: "$29/month, locked for life. First 20 customers only.",
    priceEnv: "STRIPE_PRICE_FOUNDING",
    lookupKey: "founding_monthly",
  },
  standard: {
    label: "Standard",
    blurb: "$39/month.",
    priceEnv: "STRIPE_PRICE_STANDARD",
    lookupKey: "standard_monthly",
  },
  annual: {
    label: "Annual",
    blurb: "Two months free. $390/year.",
    priceEnv: "STRIPE_PRICE_ANNUAL",
    lookupKey: "annual",
  },
};

// The $1-first-week entry price, added to every new subscription.
export const TRIAL_PRICE_ENV = "STRIPE_PRICE_TRIAL";
export const TRIAL_LOOKUP_KEY = "trial_first_week";

export function planPriceId(plan: PlanKey): string {
  const name = PLANS[plan].priceEnv;
  const v = process.env[name];
  if (!v) throw new Error(`Missing price env var: ${name} (run scripts/stripe-setup.mjs)`);
  return v;
}

export function trialPriceId(): string {
  const v = process.env[TRIAL_PRICE_ENV];
  if (!v) throw new Error(`Missing price env var: ${TRIAL_PRICE_ENV} (run scripts/stripe-setup.mjs)`);
  return v;
}

// Map a Stripe subscription status to our companies.subscription_status enum.
export function mapSubStatus(s: Stripe.Subscription.Status): string | null {
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return null; // incomplete / paused: not yet a paying customer
  }
}
