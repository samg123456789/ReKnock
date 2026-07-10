// Creates the ReKnock product and prices in Stripe (test mode), idempotently
// keyed by lookup_key. The app resolves prices by lookup_key at runtime, so
// there are no price ids to copy into env vars.
//
// Run from the repo root with your TEST secret key:
//   STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-setup.mjs
//
// Prices:
//   trial_first_week  $1   one-time  ($1 charged up front for week one; the
//                                     plan then starts after a 7-day trial)
//   founding_monthly  $29  / month   (locked for life, first 20 customers)
//   founding_annual   $290 / year    (2 months free)
//   standard_monthly  $39  / month
//   standard_annual   $390 / year    (2 months free)

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
  { lookup_key: "founding_annual", unit_amount: 29000, interval: "year", nickname: "Founding $290/yr" },
  { lookup_key: "standard_monthly", unit_amount: 3900, interval: "month", nickname: "Standard $39/mo" },
  { lookup_key: "standard_annual", unit_amount: 39000, interval: "year", nickname: "Standard $390/yr" },
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

for (const def of PRICES) {
  const price = await ensurePrice(product.id, def);
  console.log(`${def.lookup_key.padEnd(18)} ${price.id}  ($${(price.unit_amount / 100).toFixed(2)})`);
}
