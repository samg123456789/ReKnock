"use client";

import { useState } from "react";
import Link from "next/link";

/* Billing toggle: annual = 2 months free. Solo founding: $29/mo or $290/yr.
   Decrement FOUNDING_SPOTS_LEFT by hand as founding members sign up. */
const FOUNDING_SPOTS_LEFT = 20;

const timeline = [
  { step: "Today", title: "Set up in 10 minutes, pay $1", body: "Pick your tone, approve your follow-ups, log your open quotes. Card up front - tire-kickers don't close jobs." },
  { step: "1–2 days", title: "Your number goes live", body: "Carriers verify your dedicated local number (an anti-spam step every legit texting service goes through). We build everything while you wait." },
  { step: "Day 1 of your week", title: "Your $1 week starts now", body: "50 follow-up texts included. The clock doesn't start until your line is live - you never pay for waiting." },
  { step: "After the week", title: "Your founding rate kicks in", body: "Locked for life for the first 20 contractors. Cancel anytime with one tap." },
];

const soloFeatures = [
  "Unlimited quotes & follow-up sequences",
  "1 dedicated local texting number",
  "Pick your tone: friendly, professional, or straight-shooter",
  "Instant reply alerts + text relay to your phone",
  "Email, text-in, and 10-second manual intake",
  "Monthly closed-jobs report",
];
const proFeatures = [
  "Everything in Solo",
  "Zapier connection (quotes in, results out)",
  "Direct integrations - Jobber & Housecall Pro first",
  "Review requests: auto-text a Google review ask after every won job",
  "Missed-call text-back on your ReKnock line",
  "WhatsApp follow-up as an optional channel per customer",
  "Extra texting numbers as an add-on (+$10/mo each)",
];
const crewFeatures = [
  "Everything in Pro",
  "Up to 5 team members",
  "3 dedicated texting numbers included",
  "Per-estimator close-rate reporting",
  "Custom sequence timing per job size",
  "Onboarding call included",
];

function Price({ monthly, annual, isAnnual, struck }: { monthly: number; annual: number; isAnnual: boolean; struck?: { monthly: number; annual: number } }) {
  return (
    <p className="mt-5">
      <span className="display text-6xl">
        ${isAnnual ? Math.round(annual / 12) : monthly}
      </span>
      <span className="text-sm text-mist">/month</span>{" "}
      {struck && (
        <span className="text-lg text-mist line-through">
          ${isAnnual ? Math.round(struck.annual / 12) : struck.monthly}
        </span>
      )}
      {isAnnual && (
        <span className="mt-1 block text-sm text-slate">
          billed ${annual} once a year
        </span>
      )}
    </p>
  );
}

export default function PricingClient() {
  const [annual, setAnnual] = useState(false);

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_0%,#eef4ff_0%,transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 md:pb-24 md:pt-20">
        <div className="text-center">
          <p className="eyebrow mb-4">Pricing</p>
          <h1 className="display text-5xl md:text-7xl">
            <span className="text-blue">$1</span> for a week.
            <br />
            Then <span className="text-blue">$29</span>
            <span className="align-top text-2xl text-mist md:text-3xl">/mo</span>{" "}
            <span className="text-mist line-through decoration-2">$39</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate">
            The founding rate is locked for life for our first{" "}
            {FOUNDING_SPOTS_LEFT} contractors - in exchange we&apos;ll ask for
            honest feedback and, if it wins you jobs, a testimonial.
          </p>

          <div className="mt-8">
            <Link href="/signup" className="inline-block rounded-xl bg-blue px-9 py-4 text-lg font-semibold text-white shadow-[0_8px_20px_-8px_rgba(29,95,219,0.6)] transition-all hover:-translate-y-0.5 hover:bg-blue-deep">
              Claim a founding spot →
            </Link>
          </div>
        </div>

        {/* trial timeline */}
        <div className="mx-auto mt-16 max-w-4xl">
          <h2 className="display text-center text-3xl md:text-4xl">How the $1 week works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {timeline.map((t) => (
              <div key={t.title} className="card p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-blue">{t.step}</p>
                <h3 className="mt-2 font-semibold leading-snug text-ink">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate">{t.body}</p>
              </div>
            ))}
          </div>
        </div>

        {/* billing toggle - pick monthly or annual, then the plans */}
        <div className="mt-16 text-center">
          <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-sky-line bg-white p-1">
            <button
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${!annual ? "bg-blue text-white" : "text-slate hover:text-ink"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${annual ? "bg-blue text-white" : "text-slate hover:text-ink"}`}
            >
              Annual
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${annual ? "bg-white/20 text-white" : "bg-sky text-blue"}`}>
                2 months free
              </span>
            </button>
          </div>

        </div>

        {/* tiers */}
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <div className="card card-hover relative flex flex-col border-blue p-7 shadow-[0_16px_48px_-16px_rgba(29,95,219,0.35)]">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue px-3 py-1 text-xs font-bold tracking-wide text-white">AVAILABLE NOW</span>
            <h2 className="display text-3xl">Solo</h2>
            <p className="mt-1 text-slate">One contractor, unlimited chasing.</p>
            <Price monthly={29} annual={290} isAnnual={annual} struck={{ monthly: 39, annual: 390 }} />
            <p className="mt-1 text-sm font-semibold text-blue">
              Founding rate · {FOUNDING_SPOTS_LEFT} spots · locked for life
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {soloFeatures.map((f) => (
                <li key={f} className="flex gap-2.5 text-[15px] leading-snug text-slate">
                  <span aria-hidden className="mt-0.5 font-bold text-mint">✓</span>{f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className="mt-8 rounded-xl bg-blue px-6 py-3.5 text-center font-semibold text-white transition-colors hover:bg-blue-deep">
              Start for $1 →
            </Link>
          </div>

          <div className="card relative flex flex-col p-7 opacity-75 grayscale-[0.3]">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-[#e4e7ec] bg-[#f2f4f7] px-3 py-1 text-xs font-bold tracking-wide text-mist">COMING SOON</span>
            <h2 className="display text-3xl text-slate">Pro</h2>
            <p className="mt-1 text-mist">For businesses running on other tools too.</p>
            <div className="text-slate"><Price monthly={79} annual={790} isAnnual={annual} /></div>
            <ul className="mt-6 flex-1 space-y-3">
              {proFeatures.map((f) => (
                <li key={f} className="flex gap-2.5 text-[15px] leading-snug text-mist">
                  <span aria-hidden className="mt-0.5 font-bold text-mist">✓</span>{f}
                </li>
              ))}
            </ul>
            <a href="mailto:hello@getreknock.com?subject=Waitlist: Pro plan&body=Put me on the Pro waitlist. My trade: " className="mt-8 rounded-xl border border-[#e4e7ec] bg-white px-6 py-3.5 text-center font-semibold text-slate transition-colors hover:border-mist">
              Join the waitlist
            </a>
          </div>

          <div className="card relative flex flex-col p-7 opacity-75 grayscale-[0.3]">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full border border-[#e4e7ec] bg-[#f2f4f7] px-3 py-1 text-xs font-bold tracking-wide text-mist">COMING SOON</span>
            <h2 className="display text-3xl text-slate">Crew</h2>
            <p className="mt-1 text-mist">For teams with more than one estimator.</p>
            <div className="text-slate"><Price monthly={149} annual={1490} isAnnual={annual} /></div>
            <ul className="mt-6 flex-1 space-y-3">
              {crewFeatures.map((f) => (
                <li key={f} className="flex gap-2.5 text-[15px] leading-snug text-mist">
                  <span aria-hidden className="mt-0.5 font-bold text-mist">✓</span>{f}
                </li>
              ))}
            </ul>
            <a href="mailto:hello@getreknock.com?subject=Waitlist: Crew plan&body=Put me on the Crew waitlist. My trade and team size: " className="mt-8 rounded-xl border border-[#e4e7ec] bg-white px-6 py-3.5 text-center font-semibold text-slate transition-colors hover:border-mist">
              Join the waitlist
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
