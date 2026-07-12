"use client";

import { useState } from "react";
import { markFeatureTourDone } from "@/lib/tour-actions";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      title="Copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {}
      }}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-slate/20 text-slate transition-colors hover:border-blue hover:text-blue"
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}

// One-time tour shown right after onboarding. Both Skip and finishing the
// last step record it server-side so it never shows again for this company.
export default function FeatureTour({
  forwardingEmail,
  reknockNumber,
}: {
  forwardingEmail: string;
  reknockNumber: { e164: string; status: string } | null;
}) {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(true);

  if (!open) return null;

  function finish() {
    setOpen(false);
    void markFeatureTourDone();
  }

  const numberLive = reknockNumber?.status === "active";

  const steps: { badge: string; title: string; body: React.ReactNode }[] = [
    {
      badge: "The fast way in",
      title: "Forward any quote email",
      body: (
        <>
          <p>Forward or BCC a quote email and we start following up automatically. No typing.</p>
          {forwardingEmail ? (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-sky/50 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-blue-ink">{forwardingEmail}</code>
              <CopyButton value={forwardingEmail} />
            </div>
          ) : null}
        </>
      ),
    },
    {
      badge: "Reply relay",
      title: "Never miss a hot reply",
      body: (
        <p>
          The second a homeowner replies, the follow-ups stop and we text the reply straight to your personal phone. Answer by replying to that text and we pass it on.
        </p>
      ),
    },
    {
      badge: "Your ReKnock line",
      title: "Your local number",
      body: reknockNumber ? (
        <>
          <p>Every follow-up texts from your own local number, so homeowners recognize the area code and pick up.</p>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-sky/50 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-blue-ink">{reknockNumber.e164}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${numberLive ? "bg-mint/15 text-mint" : "bg-amber/15 text-amber"}`}>
              {numberLive ? "Live" : "Activating"}
            </span>
          </div>
        </>
      ) : (
        <p>
          Your follow-ups will text from a number with your local area code, so homeowners recognize it. You can pick your number right on this dashboard.
        </p>
      ),
    },
  ];

  const last = step === steps.length - 1;
  const current = steps[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true" aria-label="Quick tour">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue">{current.badge}</p>
        <h3 className="display mt-1 text-xl">{current.title}</h3>
        <div className="mt-2 text-sm leading-relaxed text-slate">{current.body}</div>

        <div className="mt-5 flex items-center justify-center gap-1.5" aria-hidden="true">
          {steps.map((_, i) => (
            <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-blue" : "w-1.5 bg-slate/25"}`} />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button type="button" onClick={finish} className="cursor-pointer text-sm font-medium text-slate hover:text-ink">
            Skip tour
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            className="cursor-pointer rounded-xl bg-blue px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-deep"
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
