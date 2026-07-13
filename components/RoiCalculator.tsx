"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";

// The lead magnet: contractor plugs in two numbers they know cold and sees
// the revenue that walks away un-followed-up. Honest math with the assumption
// exposed as a slider, not a black box.

const input =
  "w-full rounded-xl border border-slate/20 px-4 py-3 text-lg font-semibold tabular-nums outline-none focus:border-blue";

export default function RoiCalculator() {
  const [avgQuote, setAvgQuote] = useState("4500");
  const [perMonth, setPerMonth] = useState("15");
  const [recoverPct, setRecoverPct] = useState(5);

  const quote = Number(avgQuote.replace(/[^0-9.]/g, "")) || 0;
  const monthly = Number(perMonth.replace(/[^0-9]/g, "")) || 0;
  const quotedYear = quote * monthly * 12;
  const recoveredYear = Math.round((quotedYear * recoverPct) / 100);
  const recoveredJobs = quote > 0 ? Math.round((recoveredYear / quote) * 10) / 10 : 0;

  return (
    <div className="card mt-8 p-6 md:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate">Your average quote</span>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-mist">$</span>
            <input className={`${input} pl-8`} inputMode="decimal" value={avgQuote} onChange={(e) => setAvgQuote(e.target.value)} />
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-slate">Quotes you send per month</span>
          <input className={input} inputMode="numeric" value={perMonth} onChange={(e) => setPerMonth(e.target.value)} />
        </label>
      </div>

      <label className="mt-6 flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate">
          If steady follow-up saved just <span className="text-blue">{recoverPct}%</span> of that quoted work...
        </span>
        <input
          type="range"
          min={1}
          max={15}
          value={recoverPct}
          onChange={(e) => setRecoverPct(Number(e.target.value))}
          className="accent-[#1d5fdb]"
        />
        <span className="text-xs text-mist">
          Drag it. Even the low end is real money. (Most contractors never send a single follow-up, so 5% is conservative.)
        </span>
      </label>

      <div className="mt-8 rounded-2xl bg-sky p-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue">Walking away every year</p>
        <p className="display mt-2 text-5xl text-blue-ink">{formatMoney(recoveredYear) || "$0"}</p>
        <p className="mt-2 text-sm text-slate">
          You quote {formatMoney(quotedYear) || "$0"} a year. That number up there is {recoveredJobs || 0} extra {recoveredJobs === 1 ? "job" : "jobs"} you already did the hard part for.
        </p>
      </div>

      <div className="mt-6 text-center">
        <Link href="/signup" className="btn btn-primary btn-lg">
          Chase every quote for $1 →
        </Link>
        <p className="mt-2 text-xs text-mist">ReKnock follows up by text, in your voice, and stops the second they reply.</p>
      </div>
    </div>
  );
}
