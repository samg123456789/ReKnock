import Stripe from "stripe";
import { env } from "@/lib/env";

// Lazy so a missing key fails at call time (in a route), never at build.
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) _stripe = new Stripe(env.stripeSecretKey());
  return _stripe;
}

// Founding rate is auto-applied to the first N paying customers, then it
// silently becomes the standard rate. Nobody picks between the two.
export const FOUNDING_LIMIT = 20;

export type Interval = "monthly" | "annual";
export type Tier = "founding" | "standard";

// lookup_keys created by scripts/stripe-setup.mjs. Prices are resolved from
// Stripe by lookup_key at runtime (no price ids in env vars to drift/miss).
export const LOOKUP = {
  trial: "trial_first_week",
  founding: { monthly: "founding_monthly", annual: "founding_annual" },
  standard: { monthly: "standard_monthly", annual: "standard_annual" },
} as const;

export function planLookup(tier: Tier, interval: Interval): string {
  return LOOKUP[tier][interval];
}

// Display amounts (dollars) for the UI. Source of truth for charging is the
// Stripe price resolved by lookup_key above.
export const PRICING: Record<Tier, Record<Interval, number>> = {
  founding: { monthly: 29, annual: 290 },
  standard: { monthly: 39, annual: 390 },
};

// Resolve a Stripe price id by lookup_key, cached per server instance.
const priceCache = new Map<string, string>();
export async function priceIdForLookup(lookupKey: string): Promise<string> {
  const cached = priceCache.get(lookupKey);
  if (cached) return cached;
  const res = await getStripe().prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  const price = res.data[0];
  if (!price) {
    throw new Error(`No active Stripe price for lookup_key "${lookupKey}" (run scripts/stripe-setup.mjs)`);
  }
  priceCache.set(lookupKey, price.id);
  return price.id;
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
