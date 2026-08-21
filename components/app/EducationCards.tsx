"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
      className="btn-icon h-8 w-8"
    >
      {copied ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
      )}
    </button>
  );
}

// Shared internal grid so the three cards align row for row: badge and title
// at the top, body filling the middle, and a fixed-height action slot pinned
// to the bottom edge - the copy field, link, or status note in one card sits
// at exactly the same vertical position as in its neighbors.
function Card({ badge, title, children, action, className = "" }: { badge: string; title: string; children: React.ReactNode; action: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-2xl border border-sky-line bg-white p-5 ${className}`}>
      <p className="surface-label text-blue">{badge}</p>
      <h3 className="mt-1 font-semibold text-ink">{title}</h3>
      <div className="mt-2 flex-1 text-sm leading-relaxed text-slate">{children}</div>
      <div className="mt-3 flex h-12 items-center">{action}</div>
    </div>
  );
}

// Slim one-line row for a feature that is already set up: green check,
// title, and its key info kept at hand (copy still works).
function DoneRow({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-sky-line bg-white px-4 py-3">
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
  introduce = false,
}: {
  relayCell: string | null;
  reknockNumber: { e164: string; status: string } | null;
  forwardingEmail: string;
  // True once the company has at least one prospect that came in by email
  // (forward or BCC), i.e. the forwarding address has been used for real.
  hasEmailProspect?: boolean;
  // First dashboard visit after onboarding: the cards stagger in (replaces
  // the old blocking feature-tour modal) and the visit is recorded so the
  // entrance never repeats.
  introduce?: boolean;
}) {
  const numberLive = reknockNumber?.status === "active";

  useEffect(() => {
    if (!introduce) return;
    // One retry if the flag write fails; otherwise the entrance replays next login.
    void markFeatureTourDone().then((ok) => {
      if (!ok) void markFeatureTourDone();
    });
  }, [introduce]);

  // Completion signals: a set-up feature compacts to a one-line row, but a
  // card never disappears entirely.
  const emailDone = hasEmailProspect;
  const relayDone = Boolean(relayCell);
  const lineDone = numberLive;

  const fullCount = [emailDone, relayDone, lineDone].filter((d) => !d).length;
  const gridCols = fullCount >= 3 ? "md:grid-cols-3" : "md:grid-cols-2";

  return (
    <section className="mt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="surface-label">Launch checklist</p>
          <h2 className="display mt-1 text-2xl">Make the system work harder</h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-slate">These settings improve intake, handoff, and number reliability without slowing down your quoting flow.</p>
      </div>

      {(emailDone || relayDone || lineDone) && (
        <div className="mt-4 flex flex-col gap-2">
          {emailDone && (
            <DoneRow title="Quote forwarding in use">
              <code className="min-w-0 truncate text-[13px] font-semibold text-blue-ink">{forwardingEmail}</code>
              <CopyButton value={forwardingEmail} />
            </DoneRow>
          )}
          {relayDone && (
            <DoneRow title="Owner phone verified">
              <span className="min-w-0 truncate text-[13px] font-semibold text-blue-ink">{relayCell}</span>
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
            <Card
              className={introduce ? "rise rise-1" : ""}
              badge="Crown jewel"
              title="Forward any quote, we chase it"
              action={
                <div className="flex h-full w-full items-center gap-2 rounded-lg bg-sky/50 px-3">
                  <code className="min-w-0 flex-1 truncate text-[13px] font-semibold text-blue-ink">{forwardingEmail}</code>
                  <CopyButton value={forwardingEmail} />
                </div>
              }
            >
              <p>Forward or BCC a quote email from your registered email address and we pull out the customer and start following up. No typing.</p>
            </Card>
          )}
          {!relayDone && (
            <Card
              className={introduce ? "rise rise-2" : ""}
              badge="Owner phone"
              title="Verify where calls should ring"
              action={<Link href="/settings#relay-cell" className="text-sm font-semibold text-blue hover:underline">Verify your number →</Link>}
            >
              <p>Replies go to email and your inbox. We use this number for call forwarding and urgent fallbacks, so a quick code keeps customer calls from routing to the wrong person.</p>
            </Card>
          )}
          {!lineDone && (
            <Card
              className={introduce ? "rise rise-3" : ""}
              badge="Your ReKnock line"
              title="A local number they recognize"
              action={
                <div className="flex h-full w-full items-center gap-2 rounded-lg bg-sky/50 px-3">
                  {reknockNumber ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-blue-ink">{reknockNumber.e164}</span>
                      <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-semibold text-amber">Activating</span>
                    </>
                  ) : (
                    <span className="text-[13px] text-slate">Setting up your number. Carriers take up to a couple of days.</span>
                  )}
                </div>
              }
            >
              <p>Every text comes from your own local number, so customers know it is you. It is registered with the carriers so your messages land.</p>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
