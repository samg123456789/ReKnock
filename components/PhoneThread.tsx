"use client";

import { useEffect, useState } from "react";

/* Rotating example conversations. Bubble styling mirrors Apple Messages:
   outgoing = iMessage blue gradient, incoming reply = SMS green,
   18px radius, generous padding so text never crowds the corners. */

/* bubbleStyle: iMessage blue or SMS green - both are "sent by the contractor",
   mirroring real life where some homeowners are green-bubble. Replies stay grey. */
const blueSent = { background: "linear-gradient(180deg, #2E9BFF 0%, #0A7CFF 100%)", borderRadius: "18px 18px 5px 18px" };
const greenSent = { background: "linear-gradient(180deg, #4CD964 0%, #2FC94F 100%)", borderRadius: "18px 18px 5px 18px" };

const examples = [
  {
    label: "Sarah M. · Roof quote $8,400",
    sentStyle: blueSent,
    out: "Hi Sarah, it's Mike from Ridgeline Roofing. Wanted to make sure the roof quote landed okay - happy to walk through any of it.",
    outMeta: "Day 2 · sent by ReKnock",
    reply: "Yes actually - can you do the week of the 15th?",
    replyMeta: "Sequence stopped - Mike pinged on his phone",
  },
  {
    label: "Dan K. · Exterior paint $5,900",
    sentStyle: greenSent,
    out: "Hi Dan, Lisa from TrueCoat Painting. If you're comparing bids, ask what prep is included - sanding, patching, priming. Yours has it itemized, happy to walk through it.",
    outMeta: "Day 5 · sent by ReKnock",
    reply: "Good to know. One question about the trim color…",
    replyMeta: "Sequence stopped - Lisa pinged on her phone",
  },
  {
    label: "Priya R. · Cedar fence $4,200",
    sentStyle: blueSent,
    out: "Hi Priya, Tony from Northline Fence. Any thoughts on the fence quote? Totally fine if you went another direction - just let me know either way so I can plan the schedule.",
    outMeta: "Day 10 · sent by ReKnock",
    reply: "Sorry for the silence! Let's do it. When can you start?",
    replyMeta: "Sequence stopped - Tony pinged on his phone",
  },
];

export default function PhoneThread() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % examples.length), 6500);
    return () => clearInterval(t);
  }, []);

  const ex = examples[i];

  return (
    <div className="card mx-auto w-full max-w-sm p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-mist">{ex.label}</p>
        <span className="rounded-full bg-sky px-2.5 py-1 text-[10px] font-semibold tracking-wide text-blue">
          LIVE EXAMPLE
        </span>
      </div>
      <div key={i} className="flex flex-col gap-1.5">
        {/* outgoing - iMessage blue */}
        <div
          className="bubble max-w-[85%] self-end px-4 py-2.5 text-[15px] leading-[1.4] text-white"
          style={ex.sentStyle}
        >
          {ex.out}
        </div>
        <p className="bubble self-end pr-1 text-[11px] font-medium text-mist">
          {ex.outMeta}
        </p>
        {/* incoming reply - SMS green */}
        <div
          className="bubble max-w-[85%] self-start px-4 py-2.5 text-[15px] leading-[1.4] text-ink"
          style={{
            background: "#E9E9EB",
            borderRadius: "18px 18px 18px 5px",
          }}
        >
          {ex.reply}
        </div>
        <p className="bubble flex items-center gap-1.5 self-start pl-1 text-[11px] font-semibold text-mint">
          <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-mint" />
          {ex.replyMeta}
        </p>
      </div>
      <div className="mt-4 flex justify-center gap-2">
        {examples.map((_, d) => (
          <button
            key={d}
            aria-label={`Show example ${d + 1}`}
            onClick={() => setI(d)}
            className={`h-2 rounded-full transition-all ${
              d === i ? "w-6 bg-blue" : "w-2 bg-sky-line hover:bg-mist"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
