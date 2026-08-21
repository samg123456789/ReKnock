"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { extractQuote, createQuote, createQuoteUploadUrl, type CreatedQuote, type DuplicateProspect } from "@/lib/quote-actions";
import { draftTouchPreview } from "@/lib/inbox-actions";
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, MAX_FILES, IMAGE_MAX_EDGE } from "@/lib/quote-limits";
import type { QuoteExtraction, QuoteFields } from "@/lib/prompts/quote-extractor";
import { CONSENT_ATTESTATION_SINGLE, CONSENT_LINK_HREF, CONSENT_LINK_LABEL } from "@/lib/consent";

const input = "rk-input text-base";
const lowConf = "rk-input border-amber bg-amber/5 text-base";
const primaryBtn = "btn btn-primary btn-lg";
const ghostBtn = "btn btn-ghost btn-lg";

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

// Downscale big phone photos in the browser before upload. Leaves PDFs and
// already-small images untouched. Keeps OCR quality while cutting upload size.
async function prepareImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size <= MAX_IMAGE_BYTES) return file;
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
  return blob ?? file;
}

function prettyDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

type StartChoice = "now" | "tomorrow" | "recommended" | "custom";
const START_OPTIONS: { key: StartChoice; label: string; hint: string }[] = [
  { key: "recommended", label: "In 2 days", hint: "Not pushy, still fresh" },
  { key: "tomorrow", label: "Tomorrow morning", hint: "First thing in your sending hours" },
  { key: "now", label: "Start now", hint: "First text goes out within minutes" },
];

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

export default function AddQuoteForm({ numberLive = false, campaigns = [] }: { numberLive?: boolean; campaigns?: { id: string; name: string; isDefault: boolean }[] }) {
  const router = useRouter();
  const [view, setView] = useState<"intake" | "confirm" | "done">("intake");
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [conf, setConf] = useState<QuoteExtraction["confidence"]>({});
  const [source, setSource] = useState<"manual" | "ocr_upload">("manual");
  const [paths, setPaths] = useState<string[]>([]);
  const [extraction, setExtraction] = useState<QuoteExtraction | null>(null);
  const [paste, setPaste] = useState("");
  const [pending, setPending] = useState(false);
  // Wait copy tracks real progress: "uploading" during the file push,
  // "reading" once the extract action starts, then a timed hand-off to
  // "extracting" so a long Haiku call still visibly moves.
  const [stage, setStage] = useState<"uploading" | "reading" | "extracting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CreatedQuote | null>(null);
  const [start, setStart] = useState<StartChoice>("recommended");
  const [startCustom, setStartCustom] = useState("");
  const [campaignId, setCampaignId] = useState(campaigns.find((c) => c.isDefault)?.id ?? campaigns[0]?.id ?? "");
  const [dup, setDup] = useState<DuplicateProspect | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Required consent attestation on the confirm screen (proof of opt-in for
  // 10DLC). Hard-gates the submit; the server re-checks it too.
  const [consent, setConsent] = useState(false);
  // Confirmation-screen previews: draft each touch on first expand, cache after.
  const [openStep, setOpenStep] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { text?: string; error?: string }>>({});

  function toggleDraft(t: { step: number; messageId: string }) {
    setOpenStep((cur) => (cur === t.step ? null : t.step));
    if (drafts[t.messageId]) return;
    setDrafts((d) => ({ ...d, [t.messageId]: {} }));
    void draftTouchPreview(t.messageId).then((res) => {
      setDrafts((d) => ({
        ...d,
        [t.messageId]: res.ok ? { text: res.text } : { error: res.error ?? "Could not draft the preview. It will still send on schedule." },
      }));
    });
  }
  // Bumping this generation abandons any in-flight upload/extraction: the
  // stale async chain sees the mismatch and discards its result.
  const genRef = useRef(0);

  function cancelWork() {
    genRef.current++;
    setPending(false);
    setStage(null);
  }

  const STAGE_LABEL = { uploading: "Uploading...", reading: "Reading the quote...", extracting: "Pulling out the details..." } as const;
  const stageLabel = stage ? STAGE_LABEL[stage] : "Reading it...";

  // Escape: cancels in-flight extraction first; otherwise closes the flow
  // back to the dashboard (bail-out, no dead end).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (pending) cancelWork();
      else router.push("/app");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, pending]);

  function set<K extends keyof Fields>(k: K, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
    if (k === "phone") setDup(null); // a different number is a different dedupe question
  }
  const isLow = (k: keyof QuoteFields) => conf[k] != null && (conf[k] as number) < 0.6;

  async function runExtract(args: { paths?: string[]; text?: string }, src: "manual" | "ocr_upload") {
    const gen = genRef.current;
    setPending(true);
    setStage("reading");
    setError(null);
    window.setTimeout(() => {
      if (gen === genRef.current) setStage((s) => (s === "reading" ? "extracting" : s));
    }, 2500);
    const res = await extractQuote(args);
    if (gen !== genRef.current) return; // canceled while reading
    setPending(false);
    setStage(null);
    if (!res.ok) return setError(res.error);
    const extracted = fieldsFromExtraction(res.data);
    setFields(extracted);
    // A value the model returned WITHOUT a confidence score is itself suspect:
    // treat it as low so nothing extracted can slip through unflagged.
    const c = { ...(res.data.confidence ?? {}) };
    for (const k of Object.keys(extracted) as (keyof QuoteFields)[]) {
      if (extracted[k] && c[k] == null) c[k] = 0;
    }
    setConf(c);
    setExtraction(res.data);
    setSource(src);
    setView("confirm");
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    const gen = genRef.current;
    setPending(true);
    setStage("uploading");
    setError(null);
    try {
      const supabase = createClient();
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, MAX_FILES)) {
        if (gen !== genRef.current) return; // canceled mid-upload
        const isPdf = file.type === "application/pdf";
        if (!isPdf && !file.type.startsWith("image/")) {
          setPending(false);
          return setError("That file type is not supported. Upload a photo or PDF, or paste/type the details in.");
        }
        // Guard oversized files up front (do not even try to process them).
        if (isPdf && file.size > MAX_PDF_BYTES) {
          setPending(false);
          return setError("That PDF is too big to read. Send just the quote page, or paste/type the details in.");
        }
        const blob = isPdf ? file : await prepareImage(file);
        if (!isPdf && blob.size > MAX_IMAGE_BYTES) {
          setPending(false);
          return setError("That image is too big to read. Try a screenshot or smaller photo, or paste/type it in.");
        }
        const contentType = isPdf ? "application/pdf" : "image/jpeg";
        const urlRes = await createQuoteUploadUrl({ contentType, sizeBytes: blob.size });
        if (!urlRes.ok) {
          setPending(false);
          return setError(urlRes.error);
        }
        const up = await supabase.storage.from("quotes").uploadToSignedUrl(urlRes.data.path, urlRes.data.token, blob, { contentType });
        if (up.error) {
          setPending(false);
          return setError("That file would not upload. Check your connection, or paste/type the details in.");
        }
        uploaded.push(urlRes.data.path);
      }
      if (gen !== genRef.current) return; // canceled before extraction
      setPaths(uploaded);
      await runExtract({ paths: uploaded }, "ocr_upload");
    } catch {
      if (gen !== genRef.current) return;
      setPending(false);
      setError("We could not read that file. Paste the details or type them in instead.");
    }
  }

  async function submit(allowDuplicate = false) {
    if (!consent) return setError("Please confirm this customer agreed to receive texts about their quote.");
    if (start === "custom" && !startCustom) return setError("Pick a date and time for the first text, or choose one of the options.");
    setPending(true);
    setError(null);
    setDup(null);
    const res = await createQuote({
      ...fields,
      source,
      storage_paths: paths,
      extracted: extraction,
      start_choice: start,
      start_custom_iso: start === "custom" && startCustom ? new Date(startCustom).toISOString() : undefined,
      campaign_id: campaignId || undefined,
      allow_duplicate: allowDuplicate,
      consent_attested: consent,
    });
    setPending(false);
    if (!res.ok) {
      if (res.duplicate) return setDup(res.duplicate);
      return setError(res.error);
    }
    setDone(res.data);
    setView("done");
  }

  if (view === "done" && done) {
    return (
      <div className="app-panel p-5 md:p-8">
        <span className="ai-chip">Chase created</span>
        <h1 className="display mt-4 text-3xl md:text-4xl">We&apos;ll follow up with {done.firstName} for you.</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-slate">Here&apos;s the plan, in your voice. It stops the second they reply and hands the conversation to email and the inbox.</p>
        <ol className="mt-6 flex flex-col gap-2">
          {done.touches.map((t) => {
            const d = drafts[t.messageId];
            const isOpen = openStep === t.step;
            return (
              <li key={t.step} className="surface-card-compact p-0">
                <button
                  type="button"
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left"
                  onClick={() => toggleDraft(t)}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky text-sm font-bold text-blue">{t.step}</span>
                  <span className="text-ink">Touch {t.step}</span>
                  <span className="ml-auto text-sm font-semibold text-slate">{prettyDateTime(t.iso)}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={`shrink-0 text-mist transition-transform ${isOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>
                {/* 0fr -> 1fr grid rows animate an unknown content height;
                    no snap, no JS measuring. */}
                <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }} aria-hidden={!isOpen}>
                  <div className="overflow-hidden">
                    <div className="border-t border-sky-line px-4 py-3.5">
                      {d?.text ? (
                        <p className="whitespace-pre-line rounded-xl bg-sky/50 px-3 py-2 text-sm leading-relaxed text-blue-ink">{d.text}</p>
                      ) : d?.error ? (
                        <p className="text-sm text-red-600">{d.error}</p>
                      ) : (
                        <p className="text-sm text-mist">Drafting it in your voice...</p>
                      )}
                      {d?.text ? <p className="mt-1.5 text-xs text-mist">You can rewrite or move this any time from the inbox thread.</p> : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {done.devCompressed ? (
          <p className="mt-3 rounded-lg bg-amber/10 px-4 py-2 text-xs text-amber">
            Test mode: day gaps run as minutes here so you can watch the whole sequence. On the live site these land on the real days.
          </p>
        ) : null}
        <p className="mt-3 text-sm text-slate">Every one of these is yours to move, rewrite, or delete from the inbox thread.</p>
        {!numberLive ? (
          <p className="mt-4 rounded-xl bg-sky px-4 py-3 text-sm text-blue-ink">Sends begin once your ReKnock number finishes activating. Nothing goes out before then.</p>
        ) : null}
        <div className="mt-8 flex gap-3">
          <button className={primaryBtn} onClick={() => { setFields(EMPTY); setConf({}); setPaste(""); setPaths([]); setExtraction(null); setDone(null); setConsent(false); setView("intake"); }}>
            Add another quote
          </button>
          <Link href="/app" className={ghostBtn}>Back to dashboard</Link>
        </div>
      </div>
    );
  }

  if (view === "confirm") {
    // Every extracted field flags when uncertain - trust depends on nothing
    // wrong slipping through just because of which field it landed in.
    const anyLow = (["first_name", "last_name", "phone", "email", "address", "job_type", "quote_amount", "quote_date"] as (keyof QuoteFields)[]).some(isLow);
    return (
      <div className="app-panel p-5 md:p-8">
        <div className="flex items-start justify-between">
          <span className="ai-chip">AI extracted details</span>
          <CloseButton onClose={() => router.push("/app")} />
        </div>
        <h1 className="display mt-4 text-3xl md:text-4xl">Confirm the details.</h1>
        <p className="mt-3 text-slate">ReKnock read the quote. Check the fields, confirm SMS consent, then the follow-up schedule is built in your voice.</p>
        {anyLow && <p className="mt-4 rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-amber">The highlighted fields were unclear. Please double-check them.</p>}
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">First name</span>
              <input className={isLow("first_name") ? lowConf : input} value={fields.first_name} onChange={(e) => set("first_name", e.target.value)} />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Last name</span>
              <input className={isLow("last_name") ? lowConf : input} value={fields.last_name} onChange={(e) => set("last_name", e.target.value)} />
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
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Quote amount <span className="text-mist">(optional)</span></span>
              <input className={isLow("quote_amount") ? lowConf : input} inputMode="decimal" value={fields.quote_amount} onChange={(e) => set("quote_amount", e.target.value)} placeholder="$8,500" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Quote date <span className="text-mist">(optional)</span></span>
              <input className={isLow("quote_date") ? lowConf : input} type="date" value={fields.quote_date} onChange={(e) => set("quote_date", e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">Email <span className="text-mist">(optional)</span></span>
            <input className={isLow("email") ? lowConf : input} type="email" value={fields.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">Job location <span className="text-mist">(optional)</span></span>
            <input className={isLow("address") ? lowConf : input} value={fields.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" />
          </label>
        </div>
        <div className="form-section mt-7 bg-sky/30">
          <p className="text-sm font-semibold text-slate">When should the first text go out?</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {START_OPTIONS.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setStart(o.key)}
                className={`surface-card-compact cursor-pointer text-left transition-colors ${
                  start === o.key
                    ? "border-blue bg-sky/50 shadow-pop"
                    : "hover:border-blue/50"
                } ${o.key === "recommended" ? "sm:order-first ring-1 ring-blue/20" : ""}`}
              >
                <span className={`block font-semibold ${start === o.key ? "text-blue" : "text-ink"}`}>
                  {o.label}
                  {o.key === "recommended" ? <span className="ml-1.5 rounded-full bg-sky px-2 py-0.5 text-[11px] font-semibold text-blue">Recommended</span> : null}
                </span>
                <span className="mt-0.5 block text-xs text-slate">{o.hint}</span>
              </button>
            ))}
          </div>
          <div className="mt-2">
            {start === "custom" ? (
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  className={`${input} max-w-xs`}
                  value={startCustom}
                  onChange={(e) => setStartCustom(e.target.value)}
                />
                <button type="button" className="cursor-pointer text-sm text-slate underline" onClick={() => setStart("recommended")}>Never mind</button>
              </div>
            ) : (
              <button type="button" className="cursor-pointer text-sm text-blue underline" onClick={() => setStart("custom")}>
                Or pick an exact date and time
              </button>
            )}
          </div>
        </div>
        {campaigns.length > 0 ? (
          <label className="mt-5 flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">Follow-up plan</span>
            <select className={input} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}{campaign.isDefault ? " · Default" : ""}</option>)}
            </select>
            <span className="text-xs text-mist">Choose the tone and timing for this quote. You can change it later from the inbox.</span>
          </label>
        ) : null}

        <label className="surface-card-compact mt-7 flex cursor-pointer items-start gap-3">
          <input type="checkbox" className="mt-1 h-5 w-5 accent-blue" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span className="text-ink">
            {CONSENT_ATTESTATION_SINGLE}
            <span className="block text-sm text-slate">
              Required. This records their consent for your texting compliance.
            </span>
            <Link href={CONSENT_LINK_HREF} target="_blank" className="mt-0.5 block text-xs text-mist underline underline-offset-2 hover:text-blue">
              See our {CONSENT_LINK_LABEL}
            </Link>
          </span>
        </label>

        {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {dup ? (
          <div className="mt-4 rounded-xl border border-amber/50 bg-amber/10 px-4 py-3 text-sm">
            <p className="font-semibold text-ink">You&apos;re already chasing this number.</p>
            <p className="mt-1 text-slate">
              {dup.name}
              {dup.jobType ? ` · ${dup.jobType}` : ""} · currently {dup.status.replace(/_/g, " ")}
            </p>
            <div className="mt-2 flex flex-wrap gap-4">
              <Link href={`/inbox?p=${dup.id}`} className="font-semibold text-blue underline">Open that conversation</Link>
              <button type="button" className="cursor-pointer font-semibold text-slate underline" onClick={() => submit(true)}>
                This is a new quote, start another chase
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-8 flex items-center justify-between">
          <button className={ghostBtn} onClick={() => { setError(null); setDup(null); setView("intake"); }}>Back</button>
          <button className={primaryBtn} disabled={pending || !consent} onClick={() => submit()}>{pending ? "Setting up the chase..." : "Start chasing this quote"}</button>
        </div>
      </div>
    );
  }

  // intake
  return (
      <div className="app-panel p-5 md:p-8">
        <div className="flex items-start justify-between">
        <span className="ai-chip">Quote reader</span>
        <CloseButton onClose={() => router.push("/app")} />
      </div>
      <h1 className="display mt-4 text-3xl md:text-4xl">Add a quote to chase.</h1>
      <p className="mt-3 max-w-xl leading-relaxed text-slate">Upload, paste, or type the quote. ReKnock extracts the customer, job, amount, and timing, then drafts the first follow-ups in your voice.</p>

      <label
        className={`form-section mt-6 flex cursor-pointer flex-col items-center gap-3 border-dashed border-blue/45 bg-sky/35 p-8 text-center transition-colors ${dragOver ? "bg-sky/70 ring-2 ring-blue" : "hover:bg-sky/55"}`}
        onDragOver={(e) => { e.preventDefault(); if (!pending) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!pending) void onUpload(e.dataTransfer.files); }}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-xl text-blue">{pending ? "..." : "AI"}</span>
        <span className="text-lg font-semibold text-ink">{pending ? stageLabel : dragOver ? "Drop it here" : "Upload a photo or PDF"}</span>
        <span className="text-sm text-slate">Drag it here, or tap to browse. A photo of the estimate, a screenshot of a text, or the quote PDF.</span>
        <span className="text-xs text-mist">
          Photos (JPG, PNG) up to {Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB · PDFs up to {Math.round(MAX_PDF_BYTES / 1024 / 1024)}MB · up to {MAX_FILES} files
        </span>
        <input type="file" accept="image/*,application/pdf" multiple className="hidden" disabled={pending} onChange={(e) => onUpload(e.target.files)} />
      </label>
      {pending ? (
        <button type="button" className="mt-3 cursor-pointer text-sm text-slate underline" onClick={cancelWork}>
          Cancel (Esc)
        </button>
      ) : null}

      <div className="mt-4">
        <p className="text-sm font-semibold text-slate">Or paste the details</p>
        <textarea className={`${input} mt-2 min-h-28`} rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste a quote email, a text thread, anything with the customer's name and number." />
        <button className={`${ghostBtn} mt-2`} disabled={pending || !paste.trim()} onClick={() => runExtract({ text: paste }, "manual")}>
          {pending ? stageLabel : "Read the details"}
        </button>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      <button className="mt-6 cursor-pointer text-sm text-blue underline" onClick={() => { setFields(EMPTY); setConf({}); setPaths([]); setExtraction(null); setSource("manual"); setError(null); setView("confirm"); }}>
        Or just type it in
      </button>

      <p className="mt-10 border-t border-sky-line pt-5 text-sm text-slate">
        Importing a bunch?{" "}
        <Link href="/app/quotes/import" className="text-blue underline">
          Upload a CSV
        </Link>
      </p>
    </div>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      title="Close (Esc)"
      onClick={onClose}
      className="flex h-9 w-9 items-center justify-center rounded-full text-slate transition-colors hover:bg-slate/10 hover:text-ink"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
