"use client";

import { useEffect, useState } from "react";

/* Hero demo: watch the actual product loop happen, one prospect at a time.
   Timeline per prospect:
     phase 1  ReKnock sends the follow-up (the quote chase goes out)
     phase 2  the homeowner is typing
     phase 3  their reply lands -> the sequence FREEZES (upcoming touches pause)
     phase 4  ReKnock pings the contractor's phone and hands over the chat
   then it holds and advances to the next prospect, forever.

   This is decorative: the hero's headline and subhead carry the crawlable
   message. Respects reduced-motion by showing the finished story statically. */

const blueSent = {
  background: "linear-gradient(180deg, #2E9BFF 0%, #0A7CFF 100%)",
  borderRadius: "18px 18px 5px 18px",
};
const greenSent = {
  background: "linear-gradient(180deg, #4CD964 0%, #2FC94F 100%)",
  borderRadius: "18px 18px 5px 18px",
};

type Example = {
  label: string;
  owner: string;
  first: string;
  sentStyle: { background: string; borderRadius: string };
  out: string;
  outMeta: string;
  upcoming: string[];
  reply: string;
  relay: string;
};

const examples: Example[] = [
  {
    label: "Sarah M. · Roof quote $8,400",
    owner: "Mike",
    first: "Sarah",
    sentStyle: blueSent,
    out: "Hi Sarah, it's Mike from Ridgeline Roofing. Wanted to make sure the roof quote landed okay - happy to walk through any of it.",
    outMeta: "Day 2 · sent by ReKnock",
    upcoming: ["Day 5 check-in", "Day 10 soft close"],
    reply: "Yes actually - can you do the week of the 15th?",
    relay: "Sarah replied to your roof quote. Reply here and we'll pass it on.",
  },
  {
    label: "Dan K. · Exterior paint $5,900",
    owner: "Lisa",
    first: "Dan",
    sentStyle: greenSent,
    out: "Hi Dan, Lisa from TrueCoat Painting. If you're comparing bids, ask what prep is included - yours has sanding and priming itemized. Happy to walk through it.",
    outMeta: "Day 5 · sent by ReKnock",
    upcoming: ["Day 10 soft close", "Day 20 last call"],
    reply: "Good to know. One question about the trim color…",
    relay: "Dan has a question on the paint quote. Reply here to answer him.",
  },
  {
    label: "Priya R. · Cedar fence $4,200",
    owner: "Tony",
    first: "Priya",
    sentStyle: blueSent,
    out: "Hi Priya, Tony from Northline Fence. Any thoughts on the fence quote? Totally fine either way - just let me know so I can plan the schedule.",
    outMeta: "Day 10 · sent by ReKnock",
    upcoming: ["Day 20 last call"],
    reply: "Sorry for the silence! Let's do it. When can you start?",
    relay: "Priya's ready to book the fence. Reply here and we'll text her back.",
  },
];

// [phase, ms to stay before advancing]
const timeline: [number, number][] = [
  [1, 900], // send goes out
  [2, 1400], // homeowner typing
  [3, 1500], // reply lands + freeze
  [4, 3000], // relay ping, then hold
];

function StatusPill({ phase }: { phase: number }) {
  if (phase >= 4)
    return (
      <span className="rounded-full bg-mint/15 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-mint">
        HANDED TO YOU
      </span>
    );
  if (phase >= 3)
    return (
      <span className="rounded-full bg-mint/15 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-mint">
        THEY REPLIED
      </span>
    );
  return (
    <span className="rounded-full bg-sky px-2.5 py-1 text-[10px] font-semibold tracking-wide text-blue">
      FOLLOWING UP
    </span>
  );
}

export default function PhoneThread() {
  const [i, setI] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setPhase(4); // show the finished story, no looping
      return;
    }

    setPhase(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let acc = 0;
    for (const [ph, dur] of timeline) {
      const at = acc;
      timers.push(setTimeout(() => setPhase(ph), at));
      acc += dur;
    }
    // after the final hold, advance to the next prospect (effect re-runs)
    timers.push(setTimeout(() => setI((v) => (v + 1) % examples.length), acc));

    return () => timers.forEach(clearTimeout);
  }, [i]);

  const ex = examples[i];
  const frozen = phase >= 3;

  return (
    <div className="card mx-auto w-full max-w-sm p-4">
      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-xs font-medium text-mist">{ex.label}</p>
        <StatusPill phase={phase} />
      </div>

      {/* fixed min-height so the card doesn't jump as the story plays */}
      <div className="flex min-h-[318px] flex-col gap-1.5">
        {/* outgoing follow-up (the chase) */}
        {phase >= 1 && (
          <>
            <div
              className="pt-in max-w-[85%] self-end px-4 py-2.5 text-[15px] leading-[1.4] text-white"
              style={ex.sentStyle}
            >
              {ex.out}
            </div>
            <p className="self-end pr-1 text-[11px] font-medium text-mist">
              {ex.outMeta} · delivered ✓✓
            </p>
          </>
        )}

        {/* upcoming scheduled touches - dim, then visibly frozen on reply */}
        {phase >= 1 && phase < 4 && (
          <div className="mt-1 flex flex-wrap gap-1.5 self-end">
            {ex.upcoming.map((u) => (
              <span
                key={u}
                className={`rounded-full border border-dashed px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  frozen
                    ? "border-mist/40 text-mist line-through"
                    : "border-sky-line text-blue/70"
                }`}
              >
                {frozen ? "paused" : "scheduled"} · {u}
              </span>
            ))}
          </div>
        )}

        {/* homeowner typing */}
        {phase === 2 && (
          <div
            className="pt-in mt-1 max-w-[60px] self-start rounded-[18px_18px_18px_5px] bg-[#E9E9EB] px-4 py-3"
            aria-label={`${ex.first} is typing`}
          >
            <span className="flex items-center gap-1">
              <span className="pt-dot h-1.5 w-1.5 rounded-full bg-mist" />
              <span className="pt-dot h-1.5 w-1.5 rounded-full bg-mist" />
              <span className="pt-dot h-1.5 w-1.5 rounded-full bg-mist" />
            </span>
          </div>
        )}

        {/* homeowner reply lands */}
        {phase >= 3 && (
          <>
            <div
              className="pt-in mt-1 max-w-[85%] self-start px-4 py-2.5 text-[15px] leading-[1.4] text-ink"
              style={{ background: "#E9E9EB", borderRadius: "18px 18px 18px 5px" }}
            >
              {ex.reply}
            </div>
            <p className="flex items-center gap-1.5 self-start pl-1 text-[11px] font-semibold text-mint">
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-mint" />
              Sequence frozen the second they replied
            </p>
          </>
        )}

        {/* relay ping to the contractor's phone */}
        {phase >= 4 && (
          <div className="pt-ping mt-auto flex items-start gap-2.5 rounded-2xl border border-sky-line bg-sky px-3.5 py-3">
            <span aria-hidden className="text-lg leading-none">📲</span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue">
                Texted {ex.owner}&apos;s phone
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-slate">{ex.relay}</p>
            </div>
          </div>
        )}
      </div>

      {/* which prospect we're watching */}
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
