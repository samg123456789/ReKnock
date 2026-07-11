"use client";

import { useState } from "react";
import Link from "next/link";
import { createManualQuote, type CreatedQuote } from "@/lib/quote-actions";

const input = "w-full rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue";
const primaryBtn =
  "cursor-pointer rounded-xl bg-blue px-8 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60";

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function AddQuoteForm() {
  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", job_type: "", quote_amount: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreatedQuote | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createManualQuote(form);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setDone(res.data);
  }

  if (done) {
    return (
      <div>
        <p className="eyebrow mb-3">You&apos;re chasing it</p>
        <h1 className="display text-3xl md:text-4xl">
          We&apos;ll follow up with {done.firstName} for you.
        </h1>
        <p className="mt-3 text-slate">Here&apos;s the plan, written in your voice. It stops the second they reply.</p>
        <ol className="mt-6 flex flex-col gap-2">
          {done.touches.map((t) => (
            <li key={t.step} className="flex items-center gap-3 rounded-xl border border-sky-line bg-white px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky text-sm font-bold text-blue">{t.step}</span>
              <span className="text-ink">Follow-up {t.step}</span>
              <span className="ml-auto text-sm font-semibold text-slate">{prettyDate(t.date)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-xl bg-sky px-4 py-3 text-sm text-blue-ink">
          Sends begin the moment your ReKnock number finishes activating. Nothing goes out before then.
        </p>
        <div className="mt-8 flex gap-3">
          <button
            className={primaryBtn}
            onClick={() => {
              setForm({ first_name: "", last_name: "", phone: "", job_type: "", quote_amount: "" });
              setDone(null);
            }}
          >
            Add another quote
          </button>
          <Link href="/app" className="cursor-pointer rounded-xl border border-slate/20 px-6 py-3.5 font-semibold text-slate hover:border-blue hover:text-blue">
            Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Enter" && !pending) submit();
      }}
    >
      <p className="eyebrow mb-3">New quote</p>
      <h1 className="display text-3xl md:text-4xl">Add a quote to chase.</h1>
      <p className="mt-3 text-slate">Just the basics. We handle the follow-ups.</p>
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-semibold text-slate">First name</span>
            <input autoFocus className={input} value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Sarah" />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-semibold text-slate">Last name <span className="text-mist">(optional)</span></span>
            <input className={input} value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Johnson" />
          </label>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate">Their mobile number</span>
          <input className={input} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(555) 123-4567" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate">What&apos;s the job? <span className="text-mist">(optional)</span></span>
          <input className={input} value={form.job_type} onChange={(e) => setForm({ ...form, job_type: e.target.value })} placeholder="Roof replacement" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate">Quote amount <span className="text-mist">(optional)</span></span>
          <input className={input} inputMode="decimal" value={form.quote_amount} onChange={(e) => setForm({ ...form, quote_amount: e.target.value })} placeholder="$8,500" />
        </label>
      </div>
      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-8">
        <button className={primaryBtn} disabled={pending} onClick={submit}>
          {pending ? "Setting up the chase..." : "Start chasing this quote"}
        </button>
      </div>
    </div>
  );
}
