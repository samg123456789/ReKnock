"use client";

import { useState } from "react";
import { createCheckoutSession } from "@/lib/billing-actions";
import { PRICING } from "@/lib/stripe";

// Founder-supplied Starter copy (2026-07-12).
const starterFeatures: { lead: string; rest: string }[] = [
  { lead: "Never chase a quote again.", rest: " Unlimited follow-up sequences, sent for you" },
  { lead: "Sounds like you, not a robot.", rest: " AI learns your voice from your real texts" },
  { lead: "Your own local number", rest: " homeowners recognize and reply to" },
  { lead: "Reply = you take over.", rest: " Follow-ups stop instantly, emailed to you with an inbox thread" },
  { lead: "10-second intake.", rest: " Forward the email, snap a photo, done" },
  { lead: "See the money.", rest: " Quotes chased, jobs won, revenue recovered" },
];
export default function CheckoutPlan({ available, spotsLeft }: { available: boolean; spotsLeft: number }) {
  const [annual, setAnnual] = useState(true);
  const interval = annual ? "annual" : "monthly";

  const tier = available ? "founding" : "standard";
  const price = PRICING[tier];
  const monthlyEquivalent = annual ? Math.round(price.annual / 12) : price.monthly;
  const standardMonthly = PRICING.standard.monthly;

  const toggleBtn = (active: boolean) =>
    `cursor-pointer rounded-full px-5 py-2 text-sm font-semibold transition-colors ${active ? "bg-blue text-white" : "text-slate hover:text-ink"}`;

  return (
    <div className="mx-auto max-w-lg">
      <div className="text-center">
        <p className="eyebrow mb-4">Start your $1 week</p>
        <h1 className="display text-4xl md:text-5xl">
          <span className="text-blue">$1</span> for your first week.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-slate">
          We charge $1 today and start your plan after 7 days. The $1 week is the same whether you pick monthly or annual.
        </p>
      </div>

      <div className="mt-8 flex justify-center">
        <div className="inline-flex items-center gap-1 rounded-full border border-sky-line bg-white p-1">
          <button type="button" onClick={() => setAnnual(false)} className={toggleBtn(!annual)}>
            Monthly
          </button>
          <button type="button" onClick={() => setAnnual(true)} className={toggleBtn(annual)}>
            Annual
            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${annual ? "bg-white/20 text-white" : "bg-sky text-blue"}`}>✦ 2 months free</span>
          </button>
        </div>
      </div>

      {/* Starter card. No card-hover here: the hover lift shifts the buy button out from under the cursor. */}
      <div className="card relative mt-8 flex flex-col border-blue p-7 shadow-pop">
        <h2 className="display text-3xl">Starter</h2>
        <p className="mt-1 text-slate">One contractor, up to 100 new quotes a month.</p>

        <p className="mt-5">
          <span className="display text-6xl">${monthlyEquivalent}</span>
          <span className="text-sm text-mist">/month</span>{" "}
          {annual ? <span className="ml-2 text-lg text-mist line-through">${standardMonthly * 12}</span> : available ? <span className="text-lg text-mist line-through">${standardMonthly}</span> : null}
          {annual && <span className="mt-1 block text-sm text-slate">billed ${price.annual} once a year · 2 months free</span>}
        </p>

        {available ? (
          <p className="mt-1 text-sm font-semibold text-blue">Founding rate · ${price.monthly}/month · {spotsLeft} of 20 spots left · locked for life</p>
        ) : (
          <p className="mt-1 text-sm text-slate">Standard rate</p>
        )}

        <ul className="mt-6 flex-1 space-y-3">
          {starterFeatures.map((f) => (
            <li key={f.lead} className="flex gap-2.5 text-[15px] leading-snug text-slate">
              <span aria-hidden className="mt-0.5 font-bold text-mint">✓</span>
              <span><strong className="font-semibold text-ink">{f.lead}</strong>{f.rest}</span>
            </li>
          ))}
        </ul>

        <form action={createCheckoutSession.bind(null, interval)} className="mt-8">
          <button
            type="submit"
            className="w-full btn btn-primary btn-lg"
          >
            Start your $1 week →
          </button>
        </form>

        <p className="mt-3 text-center text-xs text-mist">
          $1 today, then ${annual ? `${price.annual}/year` : `${price.monthly}/month`} after your first week. Cancel anytime.
        </p>
      </div>

    </div>
  );
}
