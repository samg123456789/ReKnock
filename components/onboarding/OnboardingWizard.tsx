"use client";

import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import type { VoiceQuestionnaire, VoiceProfileResult } from "@/lib/prompts/voice-profile";
import type { InputImage } from "@/lib/ai";
import TradePicker from "@/components/onboarding/TradePicker";
import {
  saveCompanyBasics,
  saveQuoteVolume,
  scrapeAndSummarize,
  ocrTextSamples,
  generateVoiceProfile,
  saveVoiceProfile,
  saveSchedule,
  finishOnboarding,
} from "@/lib/onboarding-actions";

type Basics = {
  name: string;
  website: string;
  description: string;
  heard_about: string;
  avg_quote_amount: string;
  quotes_per_month: string;
};
type Window = { day_of_week: number; start_time: string; end_time: string; enabled: boolean };

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const US_MARKETS = [
  { tz: "America/New_York", label: "Eastern (New York)" },
  { tz: "America/Chicago", label: "Central (Chicago)" },
  { tz: "America/Denver", label: "Mountain (Denver)" },
  { tz: "America/Phoenix", label: "Arizona (no daylight saving)" },
  { tz: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { tz: "America/Anchorage", label: "Alaska (Anchorage)" },
  { tz: "America/Honolulu", label: "Hawaii (Honolulu)" },
];
const HEARD_OPTIONS = [
  "A friend or another contractor",
  "Google search",
  "Facebook or Instagram",
  "YouTube",
  "Podcast or radio",
  "Somewhere else",
];

function defaultWindows(): Window[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    if (d === 0) return { day_of_week: 0, start_time: "09:30", end_time: "18:30", enabled: false };
    if (d === 6) return { day_of_week: 6, start_time: "10:00", end_time: "14:00", enabled: true };
    return { day_of_week: d, start_time: "09:30", end_time: "18:30", enabled: true };
  });
}

const TOTAL_STEPS = 6;
const input = "w-full rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue";
const primaryBtn =
  "cursor-pointer rounded-xl bg-blue px-8 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn =
  "cursor-pointer rounded-xl border border-slate/20 px-6 py-3 font-semibold text-slate transition-colors hover:border-blue hover:text-blue";

function fileToImage(file: File): Promise<InputImage> {
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

export default function OnboardingWizard({
  initialBasics,
  initialTrades,
  initialQuestionnaire,
  initialProfile,
  initialWindows,
  initialTimezone,
  initialStep = 0,
}: {
  initialBasics: Basics;
  initialTrades: string[];
  initialQuestionnaire: VoiceQuestionnaire | null;
  initialProfile: VoiceProfileResult | null;
  initialWindows: Window[] | null;
  initialTimezone: string;
  initialStep?: number;
}) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), TOTAL_STEPS - 1));
  const [error, setError] = useState<string | null>(null);
  const [finishing, startFinish] = useTransition();

  const [basics, setBasics] = useState<Basics>(initialBasics);
  const [trades, setTrades] = useState<string[]>(initialTrades);
  const [noWebsite, setNoWebsite] = useState(false);
  const [scraping, setScraping] = useState(false);
  const scrapedFor = useRef<string>("");

  const [q, setQ] = useState<VoiceQuestionnaire>(
    initialQuestionnaire ?? {
      texting_style: "short_casual",
      casing: "sentence",
      uses_first_name: true,
      uses_emojis: false,
      uses_exclamation: false,
      sign_off: "",
      samples: ["", "", ""],
      never_say: "",
    },
  );
  const [ocrPending, setOcrPending] = useState(false);

  const [profile, setProfile] = useState<VoiceProfileResult | null>(initialProfile);
  const [masterPrompt, setMasterPrompt] = useState(initialProfile?.master_prompt ?? "");
  const [genPending, setGenPending] = useState(false);
  const [drafts, setDrafts] = useState<VoiceProfileResult[]>(initialProfile ? [initialProfile] : []);
  const [draftIdx, setDraftIdx] = useState(initialProfile ? 0 : -1);

  function showDraft(i: number) {
    if (i < 0 || i >= drafts.length) return;
    setDraftIdx(i);
    setProfile(drafts[i]);
    setMasterPrompt(drafts[i].master_prompt);
  }

  const [windows, setWindows] = useState<Window[]>(initialWindows ?? defaultWindows());
  const [timezone, setTimezone] = useState(initialTimezone || "America/New_York");
  const [copyFrom, setCopyFrom] = useState<number | null>(null); // day_of_week with the copy panel open

  useEffect(() => {
    if (!initialTimezone) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (US_MARKETS.some((m) => m.tz === tz)) setTimezone(tz);
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(next: number) {
    setError(null);
    setStep(next);
  }

  // Fire a save without blocking the UI; surface only failures.
  function persist(p: Promise<{ ok: boolean; error?: string }>) {
    p.then((r) => {
      if (!r.ok) setError(r.error ?? "Something did not save. Please check your connection.");
    }).catch(() => setError("Something did not save. Please check your connection."));
  }

  async function onWebsiteBlur() {
    const url = basics.website.trim();
    if (!url || noWebsite || url === scrapedFor.current || !url.includes(".")) return;
    scrapedFor.current = url;
    setScraping(true);
    const res = await scrapeAndSummarize(url);
    setScraping(false);
    if (res.ok) {
      setBasics((b) => (b.description.trim() ? b : { ...b, description: res.data.description }));
      if (res.data.trade_guess.length) setTrades((prev) => Array.from(new Set([...prev, ...res.data.trade_guess])));
    }
  }

  async function runGenerate() {
    setGenPending(true);
    setError(null);
    const res = await generateVoiceProfile(q);
    setGenPending(false);
    if (!res.ok) return setError(res.error);
    setDrafts((prev) => {
      const next = [...prev, res.data];
      setDraftIdx(next.length - 1);
      return next;
    });
    setProfile(res.data);
    setMasterPrompt(res.data.master_prompt);
  }

  // Copy one day's hours onto a set of days. Copying also enables the target:
  // if you copy hours onto Sunday you mean to text on Sunday.
  function copyHours(srcDay: number, targetDays: number[]) {
    const src = windows.find((w) => w.day_of_week === srcDay);
    if (!src) return;
    setWindows(
      windows.map((w) =>
        targetDays.includes(w.day_of_week) && w.day_of_week !== srcDay
          ? { ...w, start_time: src.start_time, end_time: src.end_time, enabled: true }
          : w,
      ),
    );
  }

  // Live preview of a follow-up shaped by the voice toggles (non-blocking).
  function previewText(): string {
    const greet = q.texting_style === "professional_brief" ? "Hello" : q.texting_style === "friendly_chatty" ? "Hi" : "Hey";
    const name = q.uses_first_name ? " Sarah" : " there";
    const end = q.uses_exclamation ? "!" : ".";
    const emoji = q.uses_emojis ? " 👍" : "";
    let t = `${greet}${name}, just following up on that roof quote${end}${emoji}`;
    if (q.sign_off.trim()) t += ` ${q.sign_off.trim()}`;
    if (q.casing === "lowercase") t = t.toLowerCase();
    return t;
  }

  function submitBasics() {
    if (!basics.name.trim()) return setError("Please enter your business name.");
    if (trades.length === 0) return setError("Please pick at least one trade.");
    if (!noWebsite && !basics.website.trim() && !basics.description.trim())
      return setError("Add your website, or tap 'I don't have a website' and tell us what you do.");
    if (!basics.description.trim()) return setError("Tell us what you do in a sentence.");
    persist(saveCompanyBasics({ name: basics.name, website: basics.website, description: basics.description, trades }));
    goTo(1);
  }

  function submitQuotes() {
    const avg = basics.avg_quote_amount.replace(/[^0-9.]/g, "");
    const qpm = basics.quotes_per_month.replace(/[^0-9]/g, "");
    if (!avg || !Number(avg)) return setError("Roughly how big is a typical quote? A ballpark is fine.");
    if (!qpm || !Number(qpm)) return setError("About how many quotes do you send a month? A guess is fine.");
    persist(saveQuoteVolume({ avg_quote_amount: basics.avg_quote_amount, quotes_per_month: basics.quotes_per_month }));
    goTo(2);
  }

  function submitSchedule() {
    persist(saveSchedule(windows, timezone));
    goTo(5);
  }

  async function onScreenshots(files: FileList | null) {
    if (!files || !files.length) return;
    setOcrPending(true);
    setError(null);
    try {
      const images = await Promise.all(Array.from(files).slice(0, 4).map(fileToImage));
      const res = await ocrTextSamples(images);
      if (res.ok) {
        setQ((prev) => {
          const merged = [...prev.samples];
          let idx = 0;
          for (const m of res.data) {
            while (idx < merged.length && merged[idx].trim()) idx++;
            if (idx < merged.length) merged[idx] = m;
            else merged.push(m);
          }
          return { ...prev, samples: merged.slice(0, Math.max(3, merged.length)) };
        });
      } else setError(res.error);
    } finally {
      setOcrPending(false);
    }
  }

  // Enter advances the current step, except inside a textarea (newline).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA") return;
    e.preventDefault();
    if (step === 0) submitBasics();
    else if (step === 1) submitQuotes();
    else if (step === 2) {
      setProfile(null);
      runGenerate();
      goTo(3);
    } else if (step === 4) submitSchedule();
  }

  const setSample = (i: number, v: string) =>
    setQ({ ...q, samples: q.samples.map((s, j) => (j === i ? v : s)) });

  const heardInOptions = !basics.heard_about || HEARD_OPTIONS.includes(basics.heard_about);

  return (
    <div className="mx-auto max-w-lg px-5 py-12" onKeyDown={onKeyDown}>
      <div className="mb-8">
        <p className="font-mono text-xs text-mist">Step {step + 1} of {TOTAL_STEPS}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= step ? "#1d5fdb" : "#e2e8f0" }} />
          ))}
        </div>
      </div>

      {error ? <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {/* Step 1: basics */}
      {step === 0 && (
        <div>
          <p className="eyebrow mb-3">Your business</p>
          <h1 className="display text-3xl md:text-4xl">Let&apos;s set up ReKnock.</h1>
          <p className="mt-3 text-slate">Start with your website and we&apos;ll fill in the rest. You can change anything later.</p>
          <div className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Business name</span>
              <input className={input} value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} placeholder="Apex Roofing" />
            </label>

            {!noWebsite ? (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-slate">Website</span>
                <input className={input} value={basics.website} onChange={(e) => setBasics({ ...basics, website: e.target.value })} onBlur={onWebsiteBlur} placeholder="apexroofing.com" />
                <span className="text-xs text-mist">
                  {scraping ? "Reading your site to fill this in..." : "We read your site to pre-fill the details below."}{" "}
                  <button type="button" className="cursor-pointer text-blue underline" onClick={() => setNoWebsite(true)}>
                    I don&apos;t have a website
                  </button>
                </span>
              </label>
            ) : (
              <p className="text-xs text-mist">
                No website, no problem. Just pick your trade and tell us what you do.{" "}
                <button type="button" className="cursor-pointer text-blue underline" onClick={() => setNoWebsite(false)}>
                  I do have one
                </button>
              </p>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Your trade</span>
              <TradePicker value={trades} onChange={setTrades} />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Tell us what you do</span>
              <textarea className={input} rows={2} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} placeholder="Residential roof repair and replacement across the Denver metro." />
            </label>
          </div>
          <div className="mt-8 flex justify-end">
            <button className={primaryBtn} onClick={submitBasics}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 2: quote volume */}
      {step === 1 && (
        <div>
          <p className="eyebrow mb-3">Your quotes</p>
          <h1 className="display text-3xl md:text-4xl">What do your quotes look like?</h1>
          <p className="mt-3 text-slate">Ballpark is fine. This tunes how we write your follow-ups and shows you what ReKnock brings back.</p>
          <div className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Typical quote size</span>
              <input className={input} inputMode="decimal" value={basics.avg_quote_amount} onChange={(e) => setBasics({ ...basics, avg_quote_amount: e.target.value })} placeholder="$8,500" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Quotes you send in a typical month</span>
              <input className={input} inputMode="numeric" value={basics.quotes_per_month} onChange={(e) => setBasics({ ...basics, quotes_per_month: e.target.value })} placeholder="20" />
            </label>
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button className={ghostBtn} onClick={() => goTo(0)}>Back</button>
            <button className={primaryBtn} onClick={submitQuotes}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 3: voice */}
      {step === 2 && (
        <div>
          <p className="eyebrow mb-3">Your voice</p>
          <h1 className="display text-3xl md:text-4xl">How do you text customers?</h1>
          <p className="mt-3 text-slate">This is the magic. We write every follow-up to sound like you. Change it anytime in Settings.</p>
          <div className="mt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate">Your texting style</span>
              {([
                ["short_casual", "Short and casual", "Hey Sarah, following up on that roof quote. Any questions?"],
                ["friendly_chatty", "Friendly and chatty", "Hi Sarah! Just checking in on the roof estimate we talked about. Happy to walk through anything!"],
                ["professional_brief", "Professional and brief", "Hello Sarah, following up regarding your roofing estimate. Please let me know if you have questions."],
              ] as const).map(([val, label, example]) => (
                <label key={val} className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 ${q.texting_style === val ? "border-blue bg-sky" : "border-slate/20"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="style" checked={q.texting_style === val} onChange={() => setQ({ ...q, texting_style: val })} />
                    <span className="font-semibold">{label}</span>
                  </span>
                  <span className="pl-6 text-sm italic text-mist">&ldquo;{example}&rdquo;</span>
                </label>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Capitalization</span>
              <select className={input} value={q.casing} onChange={(e) => setQ({ ...q, casing: e.target.value as VoiceQuestionnaire["casing"] })}>
                <option value="sentence">Normal sentence case</option>
                <option value="lowercase">all lowercase, casual</option>
                <option value="as_written">Match my sample texts</option>
              </select>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate">Little things</span>
              {([
                ["uses_first_name", "Use the customer's first name"],
                ["uses_exclamation", "Use exclamation points"],
                ["uses_emojis", "Use emojis"],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between rounded-xl border border-slate/20 px-4 py-3">
                  <span>{label}</span>
                  <input type="checkbox" checked={q[key]} onChange={(e) => setQ({ ...q, [key]: e.target.checked })} />
                </label>
              ))}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">How do you sign off?</span>
              <input className={input} value={q.sign_off} onChange={(e) => setQ({ ...q, sign_off: e.target.value })} placeholder="- Mike, Apex Roofing" />
            </label>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-mist">Rough preview</span>
              <div className="mt-1.5 max-w-[90%] rounded-2xl rounded-bl-sm bg-sky px-4 py-3 text-[15px] leading-snug text-ink">{previewText()}</div>
            </div>

            <div className="rounded-xl border border-sky-line bg-sky/40 p-4">
              <span className="text-sm font-semibold text-slate">Paste a few real texts you&apos;ve sent</span>
              <p className="mt-0.5 text-xs text-mist">This is what makes it sound like you. Even one helps.</p>
              <div className="mt-3 flex flex-col gap-2">
                {q.samples.map((s, i) => (
                  <input key={i} className={input} value={s} onChange={(e) => setSample(i, e.target.value)} placeholder={`Sample text ${i + 1}`} />
                ))}
              </div>
              <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue px-4 py-2 text-sm font-semibold text-blue hover:bg-blue hover:text-white">
                {ocrPending ? "Reading screenshots..." : "Upload screenshots of texts"}
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => onScreenshots(e.target.files)} disabled={ocrPending} />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Anything you&apos;d never say? <span className="text-mist">(optional)</span></span>
              <input className={input} value={q.never_say} onChange={(e) => setQ({ ...q, never_say: e.target.value })} placeholder="No hard-sell, no discounts" />
            </label>
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button className={ghostBtn} onClick={() => goTo(1)}>Back</button>
            <button
              className={primaryBtn}
              onClick={() => {
                setProfile(null);
                runGenerate();
                goTo(3);
              }}
            >
              Build my voice
            </button>
          </div>
        </div>
      )}

      {/* Step 4: voice review - the reveal */}
      {step === 3 && (
        <div>
          <p className="eyebrow mb-3">Your voice</p>
          <h1 className="display text-3xl md:text-4xl">Here&apos;s how we&apos;ll sound.</h1>
          {genPending && !profile ? (
            <div className="mt-8 flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2.5 w-2.5 animate-bounce rounded-full bg-blue" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <p className="text-slate">Reading your voice and drafting a few texts...</p>
            </div>
          ) : profile ? (
            <>
              <p className="mt-3 text-slate">Three real follow-ups, written the way you text. Homeowners see these from your number.</p>

              {/* Phone-style reveal, same visual language as the landing page thread */}
              <div className="card mx-auto mt-6 w-full max-w-sm p-4">
                <div className="mb-3 flex items-center justify-between px-1">
                  <p className="truncate text-xs font-medium text-mist">{basics.name.trim() || "Your company"} &middot; follow-ups</p>
                  <span className="shrink-0 rounded-full bg-sky px-2.5 py-1 text-[10px] font-semibold tracking-wide text-blue">
                    YOUR VOICE
                  </span>
                </div>
                <div key={`draft-${draftIdx}`} className="flex flex-col gap-1.5">
                  {profile.samples.map((s, i) => (
                    <Fragment key={i}>
                      <div
                        className="bubble max-w-[85%] self-end px-4 py-2.5 text-[15px] leading-[1.4] text-white"
                        style={{
                          background: "linear-gradient(180deg, #2E9BFF 0%, #0A7CFF 100%)",
                          borderRadius: "18px 18px 5px 18px",
                          animationDelay: `${0.15 + i * 0.55}s`,
                        }}
                      >
                        {s}
                      </div>
                      <p className="bubble self-end pr-1 text-[11px] font-medium text-mist" style={{ animationDelay: `${0.35 + i * 0.55}s` }}>
                        Follow-up {i + 1} &middot; sent by ReKnock
                      </p>
                    </Fragment>
                  ))}
                </div>
              </div>

              {drafts.length > 1 && (
                <div className="mt-4 flex items-center justify-center gap-3 text-sm">
                  <button type="button" className="cursor-pointer rounded-lg border border-slate/20 px-2 py-1 disabled:opacity-30" disabled={draftIdx <= 0} onClick={() => showDraft(draftIdx - 1)} aria-label="Previous version">&larr;</button>
                  <span className="text-mist">Version {draftIdx + 1} of {drafts.length}</span>
                  <button type="button" className="cursor-pointer rounded-lg border border-slate/20 px-2 py-1 disabled:opacity-30" disabled={draftIdx >= drafts.length - 1} onClick={() => showDraft(draftIdx + 1)} aria-label="Next version">&rarr;</button>
                </div>
              )}

              <div className="mt-8 flex flex-col gap-3">
                <button
                  className={primaryBtn}
                  onClick={() => {
                    persist(saveVoiceProfile({ questionnaire: q, masterPrompt, samples: profile.samples }));
                    goTo(4);
                  }}
                >
                  Sounds like me
                </button>
                <div className="flex items-center justify-center gap-2">
                  <button className={ghostBtn} onClick={() => goTo(2)}>Adjust answers</button>
                  <button className={ghostBtn} disabled={genPending} onClick={runGenerate}>{genPending ? "Writing..." : "Try another take"}</button>
                </div>
              </div>

              <details className="mt-6">
                <summary className="cursor-pointer text-center text-sm text-mist underline decoration-dotted underline-offset-4 hover:text-slate">
                  Fine-tune the details
                </summary>
                <textarea className={`${input} mt-3`} rows={8} value={masterPrompt} onChange={(e) => setMasterPrompt(e.target.value)} />
                <p className="mt-2 text-xs text-mist">This is the guide we follow when writing your texts. Edit anything that isn&apos;t you.</p>
              </details>
            </>
          ) : (
            <div className="mt-6">
              <button className={primaryBtn} onClick={runGenerate}>Try again</button>
            </div>
          )}
        </div>
      )}

      {/* Step 5: schedule + market */}
      {step === 4 && (
        <div>
          <p className="eyebrow mb-3">When we text</p>
          <h1 className="display text-3xl md:text-4xl">Your sending hours.</h1>
          <p className="mt-3 text-slate">These are the times homeowners actually reply. We never text before 8am or after 9pm regardless.</p>
          <label className="mt-6 flex flex-col gap-1">
            <span className="text-sm font-semibold text-slate">What market are you based in?</span>
            <select className={input} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {US_MARKETS.map((m) => (
                <option key={m.tz} value={m.tz}>{m.label}</option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex flex-col gap-2">
            {windows.map((w, i) => (
              <div key={w.day_of_week}>
                <div className="flex items-center gap-3 rounded-xl border border-slate/20 px-3 py-2.5">
                  <label className="flex w-24 items-center gap-2 sm:w-28">
                    <input type="checkbox" checked={w.enabled} onChange={(e) => { setWindows(windows.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x))); if (!e.target.checked && copyFrom === w.day_of_week) setCopyFrom(null); }} />
                    <span className={w.enabled ? "font-semibold" : "text-mist"}>{DAY_LABELS[w.day_of_week]}</span>
                  </label>
                  <input type="time" className="min-w-0 rounded-lg border border-slate/20 px-2 py-1.5 disabled:opacity-40" value={w.start_time} disabled={!w.enabled} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))} />
                  <span className="text-mist">to</span>
                  <input type="time" className="min-w-0 rounded-lg border border-slate/20 px-2 py-1.5 disabled:opacity-40" value={w.end_time} disabled={!w.enabled} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))} />
                  {w.enabled ? (
                    <button
                      type="button"
                      className={`ml-auto shrink-0 cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold ${copyFrom === w.day_of_week ? "bg-blue text-white" : "text-blue hover:bg-sky"}`}
                      aria-expanded={copyFrom === w.day_of_week}
                      onClick={() => setCopyFrom(copyFrom === w.day_of_week ? null : w.day_of_week)}
                    >
                      Copy to...
                    </button>
                  ) : null}
                </div>
                {copyFrom === w.day_of_week ? (
                  <div className="mt-1 rounded-xl bg-sky/60 px-3 py-2.5">
                    <p className="text-xs font-semibold text-slate">Copy {DAY_LABELS[w.day_of_week]}&apos;s hours to:</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <button type="button" className="cursor-pointer rounded-full border border-sky-line bg-white px-3 py-1.5 text-xs font-semibold text-blue hover:border-blue" onClick={() => copyHours(w.day_of_week, [1, 2, 3, 4, 5])}>
                        Weekdays
                      </button>
                      <button type="button" className="cursor-pointer rounded-full border border-sky-line bg-white px-3 py-1.5 text-xs font-semibold text-blue hover:border-blue" onClick={() => copyHours(w.day_of_week, [0, 1, 2, 3, 4, 5, 6])}>
                        Every day
                      </button>
                      <span aria-hidden className="mx-0.5 h-4 w-px bg-sky-line" />
                      {windows.filter((x) => x.day_of_week !== w.day_of_week).map((x) => (
                        <button key={x.day_of_week} type="button" className="cursor-pointer rounded-full border border-sky-line bg-white px-2.5 py-1.5 text-xs font-semibold text-slate hover:border-blue hover:text-blue" onClick={() => copyHours(w.day_of_week, [x.day_of_week])}>
                          {DAY_SHORT[x.day_of_week]}
                        </button>
                      ))}
                      <button type="button" className="ml-auto cursor-pointer px-2 py-1.5 text-xs font-semibold text-mist hover:text-ink" onClick={() => setCopyFrom(null)}>
                        Done
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button className={ghostBtn} onClick={() => goTo(3)}>Back</button>
            <button className={primaryBtn} onClick={submitSchedule}>Continue</button>
          </div>
        </div>
      )}

      {/* Step 6: done */}
      {step === 5 && (
        <div>
          <p className="eyebrow mb-3">You&apos;re set up</p>
          <h1 className="display text-3xl md:text-4xl">Your voice is ready.</h1>
          <p className="mt-3 text-slate">Add a quote and we&apos;ll show you exactly how we&apos;ll chase it. Your texting number activates in the background.</p>
          <div className="card mt-6 p-5">
            <p className="text-sm font-semibold text-ink">One habit that doubles your results</p>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              Ask every lead: &quot;What&apos;s the best number to text your quote to?&quot; A number you can text is a lead ReKnock can chase.
            </p>
          </div>
          <label className="mt-6 flex flex-col gap-1">
            <span className="text-sm text-mist">How did you hear about us? <span>(optional)</span></span>
            <select className={input} value={basics.heard_about} onChange={(e) => setBasics({ ...basics, heard_about: e.target.value })}>
              <option value="">Pick one if you like</option>
              {!heardInOptions ? <option value={basics.heard_about}>{basics.heard_about}</option> : null}
              {HEARD_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </label>
          <div className="mt-8 flex justify-end">
            <button className={primaryBtn} disabled={finishing} onClick={() => startFinish(() => finishOnboarding(basics.heard_about))}>
              {finishing ? "Setting up your dashboard..." : "Add my first quote"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
