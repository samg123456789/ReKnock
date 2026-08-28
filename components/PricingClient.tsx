"use client";

import { useState } from "react";

/* Public pricing stays visible while access is waitlist-only. The underlying
   checkout and plan implementation remains in place for the eventual relaunch. */

const timeline = [
  { step: "When invited", title: "Set up in 10 minutes", body: "Pick your tone, approve your follow-ups, and log your open quotes." },
  { step: "1–2 days", title: "Your number goes live", body: "Carriers verify your dedicated local number while we build everything around your workflow." },
  { step: "First week", title: "Your follow-ups run", body: "ReKnock follows up on open quotes in your voice, then gets out of the way when customers reply." },
  { step: "After launch", title: "Your rate stays locked", body: "The first 20 contractors keep the founding rate for life. Cancel anytime with one tap." },
];

// Founder-supplied Starter copy (2026-07-12).
const starterFeatures: { lead: string; rest: string }[] = [
  { lead: "Never chase a quote again.", rest: " Unlimited follow-up sequences, sent for you" },
  { lead: "Sounds like you, not a robot.", rest: " AI learns your voice from your real texts" },
  { lead: "Your own local number", rest: " homeowners recognize and reply to" },
  { lead: "Reply = you take over.", rest: " Follow-ups stop instantly, emailed to you with an inbox thread" },
  { lead: "10-second intake.", rest: " Forward the email, snap a photo, done" },
  { lead: "See the money.", rest: " Quotes chased, jobs won, revenue recovered" },
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

export default function PricingClient({ spotsLeft = 20 }: { spotsLeft?: number }) {
  const [annual, setAnnual] = useState(false);

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_0%,#eef4ff_0%,transparent_70%)]" />
      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 md:pb-24 md:pt-20">
        <div className="text-center">
          <p className="eyebrow mb-4">Pricing</p>
          <h1 className="display text-4xl sm:text-5xl md:text-7xl">
            <span className="text-blue">$29</span> per month.
            <br />
            Or <span className="text-blue">$290</span> per year.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-slate">
            ReKnock automatically follows up on contractor quotes in your voice.
            We&apos;re opening access in small batches while we prepare the next
            group of contractors.
          </p>

          <div className="mt-8">
            <a href="mailto:hello@getreknock.com?subject=ReKnock waitlist&body=I%27m interested in ReKnock. My trade and team size: " className="inline-block rounded-xl bg-blue px-9 py-4 text-lg font-semibold text-white shadow-pop transition-all hover:-translate-y-0.5 hover:bg-blue-deep">
              Join the waitlist →
            </a>
          </div>
        </div>

        {/* trial timeline */}
        <div className="mx-auto mt-16 max-w-4xl">
          <h2 className="display text-center text-3xl md:text-4xl">What happens after you join</h2>
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

        {/* billing toggle - the pricing stays visible while signup is paused */}
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

        {/* Keep the full plan detail visible; public access is paused for now. */}
        <div className="mx-auto mt-10 max-w-md">
          <div className="card card-hover relative flex flex-col border-blue p-7 shadow-pop">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue px-3 py-1 text-xs font-bold tracking-wide text-white">WAITLIST ONLY</span>
            <h2 className="display text-3xl">Starter</h2>
            <p className="mt-1 text-slate">One contractor, up to 100 new quotes a month.</p>
            <Price monthly={29} annual={290} isAnnual={annual} struck={{ monthly: 39, annual: 390 }} />
            <p className="mt-1 text-sm font-semibold text-blue">
              Planned founding rate · {spotsLeft} of 20 spots left · locked for life
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {starterFeatures.map((f) => (
                <li key={f.lead} className="flex gap-2.5 text-[15px] leading-snug text-slate">
                  <span aria-hidden className="mt-0.5 font-bold text-mint">✓</span>
                  <span><strong className="font-semibold text-ink">{f.lead}</strong>{f.rest}</span>
                </li>
              ))}
            </ul>
            <a href="mailto:hello@getreknock.com?subject=ReKnock waitlist&body=I%27m interested in ReKnock. My trade and team size: " className="mt-8 rounded-xl bg-blue px-6 py-3.5 text-center font-semibold text-white transition-colors hover:bg-blue-deep">
              Join the waitlist →
            </a>
          </div>

          <p className="mt-6 text-center text-sm text-mist">
            Growth $79 · Crew $149 - coming soon.{" "}
            <a href="mailto:hello@getreknock.com?subject=Waitlist: Growth or Crew plan&body=Put me on the waitlist. My trade and team size: " className="text-slate underline underline-offset-2 hover:text-ink">
              Join the waitlist
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
