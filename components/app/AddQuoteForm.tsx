"use client";

import { useState } from "react";
import Link from "next/link";
import { extractQuote, createQuote, type CreatedQuote } from "@/lib/quote-actions";
import type { MediaInput } from "@/lib/ai";
import type { QuoteExtraction, QuoteFields } from "@/lib/prompts/quote-extractor";

const input = "w-full rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue";
const lowConf = "w-full rounded-xl border-2 border-amber/70 bg-amber/5 px-4 py-3 text-base outline-none focus:border-blue";
const primaryBtn =
  "cursor-pointer rounded-xl bg-blue px-8 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn = "cursor-pointer rounded-xl border border-slate/20 px-6 py-3.5 font-semibold text-slate hover:border-blue hover:text-blue";

type Fields = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  job_type: string;
  quote_amount: string;
  quote_date: string;
};
const EMPTY: Fields = { first_name: "", last_name: "", phone: "", email: "", address: "", job_type: "", quote_amount: "", quote_date: "" };

function fileToMedia(file: File): Promise<MediaInput> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result);
      resolve({ mediaType: file.type || "image/png", dataBase64: res.slice(res.indexOf(",") + 1) });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function prettyDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fieldsFromExtraction(e: QuoteExtraction): Fields {
  const s = (v: string | number | null) => (v == null ? "" : String(v));
  return {
    first_name: s(e.first_name),
    last_name: s(e.last_name),
    phone: s(e.phone),
    email: s(e.email),
    address: s(e.address),
    job_type: s(e.job_type),
    quote_amount: s(e.quote_amount),
    quote_date: s(e.quote_date),
  };
}

export default function AddQuoteForm() {
  const [view, setView] = useState<"intake" | "confirm" | "done">("intake");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [conf, setConf] = useState<QuoteExtraction["confidence"]>({});
  const [source, setSource] = useState<"manual" | "ocr_upload">("manual");
  const [consent, setConsent] = useState("verbal_at_quote");
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreatedQuote | null>(null);

  function set<K extends keyof Fields>(k: K, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
  }
  const isLow = (k: keyof QuoteFields) => conf[k] != null && (conf[k] as number) < 0.6;

  async function runExtract(args: { media?: MediaInput[]; text?: string }, src: "manual" | "ocr_upload") {
    setPending(true);
    setError(null);
    const res = await extractQuote(args);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setFields(fieldsFromExtraction(res.data));
    setConf(res.data.confidence ?? {});
    setSource(src);
    setView("confirm");
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setPending(true);
    setError(null);
    try {
      const media = await Promise.all(Array.from(files).slice(0, 3).map(fileToMedia));
      await runExtract({ media }, "ocr_upload");
    } catch {
      setPending(false);
      setError("Could not read that file.");
    }
  }

  async function submit() {
    setPending(true);
    setError(null);
    const res = await createQuote({ ...fields, consent_path: consent, source });
    setPending(false);
    if (!res.ok) return setError(res.error);
    setDone(res.data);
    setView("done");
  }

  if (view === "done" && done) {
    return (
      <div>
        <p className="eyebrow mb-3">You&apos;re chasing it</p>
        <h1 className="display text-3xl md:text-4xl">We&apos;ll follow up with {done.firstName} for you.</h1>
        <p className="mt-3 text-slate">Here&apos;s the plan, in your voice. It stops the second they reply.</p>
        <ol className="mt-6 flex flex-col gap-2">
          {done.touches.map((t) => (
            <li key={t.step} className="flex items-center gap-3 rounded-xl border border-sky-line bg-white px-4 py-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky text-sm font-bold text-blue">{t.step}</span>
              <span className="text-ink">Follow-up {t.step}</span>
              <span className="ml-auto text-sm font-semibold text-slate">{prettyDate(t.date)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-xl bg-sky px-4 py-3 text-sm text-blue-ink">Sends begin once your ReKnock number finishes activating. Nothing goes out before then.</p>
        <div className="mt-8 flex gap-3">
          <button className={primaryBtn} onClick={() => { setFields(EMPTY); setConf({}); setPaste(""); setConsent("verbal_at_quote"); setDone(null); setView("intake"); }}>
            Add another quote
          </button>
          <Link href="/app" className={ghostBtn}>Back to dashboard</Link>
        </div>
      </div>
    );
  }

  if (view === "confirm") {
    const anyLow = (["first_name", "phone", "job_type", "quote_amount"] as (keyof QuoteFields)[]).some(isLow);
    return (
      <div>
        <p className="eyebrow mb-3">Check this looks right</p>
        <h1 className="display text-3xl md:text-4xl">Confirm the details.</h1>
        {anyLow && <p className="mt-3 rounded-lg bg-amber/10 px-4 py-2 text-sm text-amber">The highlighted fields were unclear. Please double-check them.</p>}
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">First name</span>
              <input className={isLow("first_name") ? lowConf : input} value={fields.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Last name</span>
              <input className={input} value={fields.last_name} onChange={(e) => set("last_name", e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">Mobile number</span>
            <input className={isLow("phone") ? lowConf : input} type="tel" value={fields.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">Job <span className="text-mist">(optional)</span></span>
            <input className={isLow("job_type") ? lowConf : input} value={fields.job_type} onChange={(e) => set("job_type", e.target.value)} placeholder="Roof replacement" />
          </label>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Quote amount <span className="text-mist">(optional)</span></span>
              <input className={isLow("quote_amount") ? lowConf : input} inputMode="decimal" value={fields.quote_amount} onChange={(e) => set("quote_amount", e.target.value)} placeholder="$8,500" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Quote date <span className="text-mist">(optional)</span></span>
              <input className={input} type="date" value={fields.quote_date} onChange={(e) => set("quote_date", e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">How did you get their OK to text?</span>
            <select className={input} value={consent} onChange={(e) => setConsent(e.target.value)}>
              <option value="verbal_at_quote">They gave me their number for the quote</option>
              <option value="web_form">They filled out a form / requested a quote online</option>
            </select>
            <span className="text-xs text-mist">Required. We only text customers who agreed to hear from you.</span>
          </label>
        </div>
        {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-8 flex items-center justify-between">
          <button className={ghostBtn} onClick={() => { setError(null); setView("intake"); }}>Back</button>
          <button className={primaryBtn} disabled={pending} onClick={submit}>{pending ? "Setting up the chase..." : "Start chasing this quote"}</button>
        </div>
      </div>
    );
  }

  // intake
  return (
    <div>
      <p className="eyebrow mb-3">New quote</p>
      <h1 className="display text-3xl md:text-4xl">Add a quote to chase.</h1>
      <p className="mt-3 text-slate">Snap it, paste it, or type it. We pull out the details.</p>

      <label className="card mt-6 flex cursor-pointer flex-col items-center gap-2 border-blue p-7 text-center hover:bg-sky/40">
        <span className="text-lg font-semibold text-ink">{pending ? "Reading it..." : "Upload a photo or PDF"}</span>
        <span className="text-sm text-slate">A photo of the estimate, a screenshot of a text, or the quote PDF.</span>
        <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={pending} onChange={(e) => onUpload(e.target.files)} />
      </label>

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate">Or paste the details</p>
        <textarea className={`${input} mt-2`} rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a quote email, a text thread, anything with the customer's name and number." />
        <button className={`${ghostBtn} mt-2`} disabled={pending || !paste.trim()} onClick={() => runExtract({ text: paste }, "manual")}>
          {pending ? "Reading it..." : "Read the details"}
        </button>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <button className="mt-6 cursor-pointer text-sm text-blue underline" onClick={() => { setFields(EMPTY); setConf({}); setSource("manual"); setError(null); setView("confirm"); }}>
        Or just type it in
      </button>
    </div>
  );
}
