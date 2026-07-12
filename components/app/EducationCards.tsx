"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DISMISS_KEY = "reknock_edu_dismissed";

type CardKey = "relay" | "line" | "email";

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

function Card({ onDismiss, badge, title, children }: { onDismiss: () => void; badge: string; title: string; children: React.ReactNode }) {
  return (
    <div className="relative rounded-2xl border border-sky-line bg-white p-5">
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full text-mist transition-colors hover:bg-slate/10 hover:text-ink">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
      <p className="text-xs font-semibold uppercase tracking-wide text-blue">{badge}</p>
      <h3 className="mt-1 font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm leading-relaxed text-slate">{children}</div>
    </div>
  );
}

export default function EducationCards({
  relayCell,
  reknockNumber,
  forwardingEmail,
}: {
  relayCell: string | null;
  reknockNumber: { e164: string; status: string } | null;
  forwardingEmail: string;
}) {
  const [dismissed, setDismissed] = useState<Set<CardKey> | null>(null);

  useEffect(() => {
    try {
      setDismissed(new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]")));
    } catch {
      setDismissed(new Set());
    }
  }, []);

  function dismiss(key: CardKey) {
    setDismissed((prev) => {
      const next = new Set(prev ?? []);
      next.add(key);
      localStorage.setItem(DISMISS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  if (!dismissed) return null; // avoid flash before we know what's dismissed
  const show = (k: CardKey) => !dismissed.has(k);
  if (!show("relay") && !show("line") && !show("email")) return null;

  const numberLive = reknockNumber?.status === "active";

  return (
    <section className="mt-12">
      <h2 className="display text-xl">Get more from ReKnock</h2>
      <p className="mt-1 text-sm text-slate">A few things that make the whole system work harder for you.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {show("email") && (
          <Card onDismiss={() => dismiss("email")} badge="Crown jewel" title="Forward any quote, we chase it">
            <p>Forward or BCC a quote email to your private address and we pull out the customer and start following up. No typing.</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky/50 px-3 py-2">
              <code className="min-w-0 flex-1 truncate text-[13px] font-semibold text-blue-ink">{forwardingEmail}</code>
              <CopyButton value={forwardingEmail} />
            </div>
          </Card>
        )}
        {show("relay") && (
          <Card onDismiss={() => dismiss("relay")} badge="Reply relay" title="Replies come straight to your phone">
            <p>The moment a homeowner texts back, we stop the follow-ups and ping your cell. Just text back and we pass it on.</p>
            {relayCell ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky/50 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-blue-ink">Pinging {relayCell}</span>
                <Link href="/settings" className="shrink-0 text-xs font-semibold text-blue hover:underline">Change</Link>
              </div>
            ) : (
              <Link href="/settings" className="mt-3 inline-block text-sm font-semibold text-blue hover:underline">Add your cell number →</Link>
            )}
          </Card>
        )}
        {show("line") && (
          <Card onDismiss={() => dismiss("line")} badge="Your ReKnock line" title="A local number they recognize">
            <p>Every text comes from your own local number, so customers know it is you. It is registered with the carriers so your messages land.</p>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-sky/50 px-3 py-2">
              {reknockNumber ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-blue-ink">{reknockNumber.e164}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${numberLive ? "bg-mint/15 text-mint" : "bg-amber/15 text-amber"}`}>
                    {numberLive ? "Live" : "Activating"}
                  </span>
                </>
              ) : (
                <span className="text-[13px] text-slate">Setting up your number. Carriers take up to a couple of days.</span>
              )}
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
