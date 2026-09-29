"use client";

import { useState } from "react";
import WaitlistForm from "@/components/WaitlistForm";
import InfoTip from "@/components/InfoTip";

const features = [
  "Voice-matched SMS follow-up",
  "Dedicated local number",
  "Quote forwarding and photo intake",
  "Inbox takeover when a customer replies",
  "Revenue and quote outcome tracking",
];

export default function PricingClient({ spotsLeft = 20 }: { spotsLeft?: number }) {
  const [annual, setAnnual] = useState(true);
  const displayedPrice = annual ? 390 : 39;

  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_0%,#eef4ff_0%,transparent_70%)]" />
      <div className="relative mx-auto max-w-5xl px-5 pb-12 pt-8 md:pb-16 md:pt-10">
        <div className="text-center">
          <p className="eyebrow mb-3">Pricing</p>
          <h1 className="display text-4xl sm:text-5xl md:text-6xl">Follow up like you have a sales team.</h1>
          <p className="mx-auto mt-3 max-w-2xl text-base text-slate md:text-lg">One focused plan for keeping open quotes alive, in your voice, until the customer replies.</p>
          <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-sky-line bg-white p-1">
            <button type="button" onClick={() => setAnnual(false)} className={`rounded-full px-4 py-2 text-sm font-semibold ${!annual ? "bg-blue text-white" : "text-slate hover:text-ink"}`}>Monthly</button>
            <button type="button" onClick={() => setAnnual(true)} className={`rounded-full px-4 py-2 text-sm font-semibold ${annual ? "bg-blue text-white" : "text-slate hover:text-ink"}`}>Annual <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${annual ? "bg-white/20 text-white" : "bg-sky text-blue"}`}>✦ 2 months free</span></button>
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-xl">
          <div className="card relative flex flex-col border-blue p-5 shadow-pop md:p-6">
            <span className="absolute -top-3 left-6 rounded-full bg-blue px-3 py-1 text-xs font-bold tracking-wide text-white">FOUNDING ACCESS</span>
            <div className="flex items-start justify-between gap-3"><div><h2 className="display text-3xl">Starter</h2><p className="mt-1 text-slate">Everything needed to consistently follow up on contractor quotes.</p></div><InfoTip label="About Starter">The core ReKnock workflow. Start here while the product is still focused on one job: helping you win more of the quotes you already wrote.</InfoTip></div>
            <p className="mt-4"><span className="display text-5xl">${displayedPrice}</span><span className="text-sm text-mist">/{annual ? "year" : "month"}</span>{annual ? <span className="ml-2 text-lg text-mist line-through">$468</span> : null}</p>
            {annual ? <p className="mt-1 text-sm text-slate">Billed once a year · 2 months free.</p> : null}
            <p className="mt-2 text-sm font-semibold text-blue">Founding rate · ${annual ? "$390/year" : "$39/month"} · {spotsLeft} of 20 spots left · locked for life</p>
            <ul className="mt-5 space-y-2.5">{features.map((feature) => <li key={feature} className="flex gap-2.5 text-[15px] leading-snug text-slate"><span className="font-bold text-mint">✓</span><span>{feature}</span></li>)}</ul>
            <a href="#waitlist" className="btn btn-primary btn-lg mt-5 text-center">Join the waitlist</a>
          </div>
        </div>

        <div id="waitlist" className="mx-auto mt-14 grid max-w-4xl gap-8 scroll-mt-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div><p className="eyebrow mb-3">Early access</p><h2 className="display text-3xl md:text-4xl">Tell us how you run quotes.</h2><p className="mt-3 leading-relaxed text-slate">This helps us invite the right contractors first and shape the product around real workflows. No email thread, no vague signup.</p></div>
          <div className="card p-6 md:p-7"><WaitlistForm source="pricing" /></div>
        </div>
      </div>
    </section>
  );
}
