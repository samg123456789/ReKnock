"use client";

import { useState } from "react";
import Link from "next/link";

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
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate/20 text-slate transition-colors hover:border-blue hover:text-blue"
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}

function Card({ badge, title, children }: { badge: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-sky-line bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue">{badge}</p>
      <h3 className="mt-1 font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-slate">{children}</div>
    </div>
  );
}

// Slim one-line row for a feature that is already set up: green check,
// title, and its key info kept at hand (copy still works).
function DoneRow({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-sky-line bg-white px-4 py-2.5">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-mint/15 text-mint">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <span className="shrink-0 text-sm font-semibold text-ink">{title}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

export default function EducationCards({
  relayCell,
  reknockNumber,
  forwardingEmail,
  hasEmailProspect = false,
}: {
  relayCell: string | null;
  reknockNumber: { e164: string; status: string } | null;
  forwardingEmail: string;
  // True once the company has at least one prospect that came in by email
  // (forward or BCC), i.e. the forwarding address has been used for real.
  hasEmailProspect?: boolean;
}) {
  const numberLive = reknockNumber?.status === "active";

  // Completion signals: a set-up feature compacts to a one-line row, but a
  // card never disappears entirely.
  const emailDone = hasEmailProspect;
  const relayDone = Boolean(relayCell);
  const lineDone = numberLive;

  const fullCount = [emailDone, relayDone, lineDone].filter((d) => !d).length;
  const gridCols = fullCount >= 3 ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <section className="mt-12">
      <h2 className="display text-xl">Get more from ReKnock</h2>
      <p className="mt-1 text-sm text-slate">A few things that make the whole system work harder for you.</p>

      {(emailDone || relayDone || lineDone) && (
        <div className="mt-4 flex flex-col gap-2">
          {emailDone && (
            <DoneRow title="Quote forwarding in use">
              <code className="min-w-0 truncate text-[13px] font-semibold text-blue-ink">{forwardingEmail}</code>
              <CopyButton value={forwardingEmail} />
            </DoneRow>
          )}
          {relayDone && (
            <DoneRow title="Reply relay on">
              <span className="min-w-0 truncate text-[13px] font-semibold text-blue-ink">Pinging {relayCell}</span>
              <Link href="/settings#relay-cell" className="shrink-0 text-xs font-semibold text-blue hover:underline">Change</Link>
            </DoneRow>
          )}
          {lineDone && reknockNumber && (
            <DoneRow title="Your ReKnock line is live">
              <span className="min-w-0 truncate text-[13px] font-semibold text-blue-ink">{reknockNumber.e164}</span>
              <span className="shrink-0 rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-semibold text-mint">Live</span>
            </DoneRow>
          )}
        </div>
      )}

      {fullCount > 0 && (
        <div className={`mt-4 grid gap-3 ${gridCols}`}>
          {!emailDone && (
            <Card badge="Crown jewel" title="Forward any quote, we chase it">
              <p>Forward or BCC a quote email from your registered email address and we pull out the customer and start following up. No typing.</p>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky/50 px-3 py-2">
                <code className="min-w-0 flex-1 truncate text-[13px] font-semibold text-blue-ink">{forwardingEmail}</code>
                <CopyButton value={forwardingEmail} />
              </div>
            </Card>
          )}
          {!relayDone && (
            <Card badge="Reply relay" title="Replies come straight to your phone">
              <p>The moment a homeowner texts back, we stop the follow-ups and ping your cell. Just text back and we pass it on.</p>
              <Link href="/settings#relay-cell" className="mt-3 inline-block text-sm font-semibold text-blue hover:underline">Add your cell number →</Link>
            </Card>
          )}
          {!lineDone && (
            <Card badge="Your ReKnock line" title="A local number they recognize">
              <p>Every text comes from your own local number, so customers know it is you. It is registered with the carriers so your messages land.</p>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky/50 px-3 py-2">
                {reknockNumber ? (
                  <>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-blue-ink">{reknockNumber.e164}</span>
                    <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-semibold text-amber">Activating</span>
                  </>
                ) : (
                  <span className="text-[13px] text-slate">Setting up your number. Carriers take up to a couple of days.</span>
                )}
              </div>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
