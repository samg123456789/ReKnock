// Creates the ReKnock product and the four prices in Stripe (test mode),
// idempotently keyed by lookup_key. Prints the price ids to paste into env.
//
// Run from the repo root with your TEST secret key:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//
// Prices (CLAUDE.md Phase 1):
//   trial_first_week  $1  one-time  (entry: $1 charged up front for week one;
//                                    the plan then starts after a 7-day trial)
//   founding_monthly  $29 / month   (locked for life, first 20 customers)
//   standard_monthly  $39 / month
//   annual            $390 / year   (two months free, 10x standard monthly)

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key || !key.startsWith("sk_")) {
  console.error("Set STRIPE_SECRET_KEY to your Stripe TEST secret key (sk_test_...).");
  process.exit(1);
}
if (key.startsWith("sk_live_")) {
  console.error("Refusing to run against a LIVE key. Use the test key (sk_test_...).");
  process.exit(1);
}

const stripe = new Stripe(key);

const PRODUCT_NAME = "ReKnock";
const PRICES = [
  { lookup_key: "trial_first_week", unit_amount: 100, interval: null, nickname: "$1 first week" },
  { lookup_key: "founding_monthly", unit_amount: 2900, interval: "month", nickname: "Founding $29/mo" },
  { lookup_key: "standard_monthly", unit_amount: 3900, interval: "month", nickname: "Standard $39/mo" },
  { lookup_key: "annual", unit_amount: 39000, interval: "year", nickname: "Annual $390/yr" },
];

async function ensureProduct() {
  const existing = await stripe.products.search({ query: `name:"${PRODUCT_NAME}" AND active:"true"` });
  if (existing.data[0]) return existing.data[0];
  return stripe.products.create({ name: PRODUCT_NAME });
}

async function ensurePrice(productId, def) {
  const found = await stripe.prices.search({ query: `lookup_key:"${def.lookup_key}"` });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({
    product: productId,
    currency: "usd",
    unit_amount: def.unit_amount,
    ...(def.interval ? { recurring: { interval: def.interval } } : {}),
    lookup_key: def.lookup_key,
    nickname: def.nickname,
  });
}

const product = await ensureProduct();
console.log(`Product: ${product.name} (${product.id})\n`);

const envNames = {
  trial_first_week: "STRIPE_PRICE_TRIAL",
  founding_monthly: "STRIPE_PRICE_FOUNDING",
  standard_monthly: "STRIPE_PRICE_STANDARD",
  annual: "STRIPE_PRICE_ANNUAL",
};

console.log("Add these to .env.local and Vercel (Preview + Development):\n");
for (const def of PRICES) {
  const price = await ensurePrice(product.id, def);
  console.log(`${envNames[def.lookup_key]}=${price.id}`);
}
