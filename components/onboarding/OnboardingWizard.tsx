"use client";

import { useEffect, useState } from "react";
import { TRADES } from "@/lib/trades";
import type { VoiceQuestionnaire, VoiceProfileResult } from "@/lib/prompts/voice-profile";
import {
  saveCompanyBasics,
  generateVoiceProfile,
  saveVoiceProfile,
  saveSchedule,
  finishOnboarding,
} from "@/lib/onboarding-actions";

type Basics = { name: string; trade: string; website: string; description: string; timezone: string };
type Window = { day_of_week: number; start_time: string; end_time: string; enabled: boolean };

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function defaultWindows(): Window[] {
  return [0, 1, 2, 3, 4, 5, 6].map((d) => {
    if (d === 0) return { day_of_week: 0, start_time: "09:30", end_time: "18:30", enabled: false };
    if (d === 6) return { day_of_week: 6, start_time: "10:00", end_time: "14:00", enabled: true };
    return { day_of_week: d, start_time: "09:30", end_time: "18:30", enabled: true };
  });
}

const TOTAL_STEPS = 5;
const input = "w-full rounded-xl border border-slate/20 px-4 py-3 text-base outline-none focus:border-blue";
const primaryBtn =
  "rounded-xl bg-blue px-8 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-blue-deep disabled:cursor-not-allowed disabled:opacity-60";
const ghostBtn = "rounded-xl border border-slate/20 px-6 py-3 font-semibold text-slate transition-colors hover:border-blue hover:text-blue";

export default function OnboardingWizard({
  initialBasics,
  initialQuestionnaire,
  initialProfile,
  initialWindows,
}: {
  initialBasics: Basics;
  initialQuestionnaire: VoiceQuestionnaire | null;
  initialProfile: VoiceProfileResult | null;
  initialWindows: Window[] | null;
}) {
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [basics, setBasics] = useState<Basics>(initialBasics);
  const [q, setQ] = useState<VoiceQuestionnaire>(
    initialQuestionnaire ?? {
      texting_style: "short_casual",
      uses_first_name: true,
      uses_emojis: false,
      uses_exclamation: false,
      sign_off: "",
      sample_texts: "",
      never_say: "",
    },
  );
  const [profile, setProfile] = useState<VoiceProfileResult | null>(initialProfile);
  const [masterPrompt, setMasterPrompt] = useState(initialProfile?.master_prompt ?? "");
  const [windows, setWindows] = useState<Window[]>(initialWindows ?? defaultWindows());

  // Auto-detect timezone if we don't have one yet.
  useEffect(() => {
    if (!basics.timezone) {
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz) setBasics((b) => ({ ...b, timezone: tz }));
      } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(next: number) {
    setError(null);
    setStep(next);
  }

  async function runGenerate() {
    setPending(true);
    setError(null);
    const res = await generateVoiceProfile(q);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setProfile(res.data);
    setMasterPrompt(res.data.master_prompt);
  }

  // Step 3 is entered from step 2; generate on arrival if nothing is loaded.
  useEffect(() => {
    if (step === 2 && !profile && !pending) runGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      {/* progress */}
      <div className="mb-8">
        <p className="font-mono text-xs text-mist">Step {step + 1} of {TOTAL_STEPS}</p>
        <div className="mt-2 flex gap-1.5" aria-hidden>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= step ? "#1d5fdb" : "#e2e8f0" }} />
          ))}
        </div>
      </div>

      {error ? <p className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}

      {/* Step 1: company basics */}
      {step === 0 && (
        <div>
          <p className="eyebrow mb-3">Your business</p>
          <h1 className="display text-3xl md:text-4xl">Let&apos;s set up ReKnock.</h1>
          <p className="mt-3 text-slate">A few basics so your follow-ups sound right. You can change all of this later.</p>
          <div className="mt-6 flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Business name</span>
              <input className={input} value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} placeholder="Apex Roofing" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Trade</span>
              <select className={input} value={basics.trade} onChange={(e) => setBasics({ ...basics, trade: e.target.value })}>
                <option value="">Pick your trade</option>
                {TRADES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Website <span className="text-mist">(optional)</span></span>
              <input className={input} value={basics.website} onChange={(e) => setBasics({ ...basics, website: e.target.value })} placeholder="apexroofing.com" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">What you do <span className="text-mist">(optional)</span></span>
              <textarea className={input} rows={2} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} placeholder="Residential roof repair and replacement in the Denver area." />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Timezone</span>
              <input className={input} value={basics.timezone} onChange={(e) => setBasics({ ...basics, timezone: e.target.value })} placeholder="America/Denver" />
              <span className="text-xs text-mist">We use this to send at good hours. We auto-detected it, but you can fix it.</span>
            </label>
          </div>
          <div className="mt-8 flex justify-end">
            <button
              className={primaryBtn}
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const res = await saveCompanyBasics(basics);
                setPending(false);
                if (!res.ok) return setError(res.error);
                goTo(1);
              }}
            >
              {pending ? "Saving..." : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: voice questionnaire */}
      {step === 1 && (
        <div>
          <p className="eyebrow mb-3">Your voice</p>
          <h1 className="display text-3xl md:text-4xl">How do you text customers?</h1>
          <p className="mt-3 text-slate">This is the magic. We&apos;ll write every follow-up to sound like you.</p>
          <div className="mt-6 flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-slate">Your texting style</span>
              {([
                ["short_casual", "Short and casual"],
                ["friendly_chatty", "Friendly and chatty"],
                ["professional_brief", "Professional and brief"],
              ] as const).map(([val, label]) => (
                <label key={val} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${q.texting_style === val ? "border-blue bg-sky" : "border-slate/20"}`}>
                  <input type="radio" name="style" checked={q.texting_style === val} onChange={() => setQ({ ...q, texting_style: val })} />
                  {label}
                </label>
              ))}
            </div>
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
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Paste 2 or 3 real texts you&apos;ve sent <span className="text-mist">(optional, but it helps a lot)</span></span>
              <textarea className={input} rows={4} value={q.sample_texts} onChange={(e) => setQ({ ...q, sample_texts: e.target.value })} placeholder="Hey Sarah, just following up on that roof quote. Any questions?" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-slate">Anything you&apos;d never say? <span className="text-mist">(optional)</span></span>
              <input className={input} value={q.never_say} onChange={(e) => setQ({ ...q, never_say: e.target.value })} placeholder="No hard-sell, no discounts" />
            </label>
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button className={ghostBtn} onClick={() => goTo(0)}>Back</button>
            <button
              className={primaryBtn}
              onClick={() => {
                // Regenerate from fresh answers.
                setProfile(null);
                goTo(2);
              }}
            >
              Build my voice
            </button>
          </div>
        </div>
      )}

      {/* Step 3: voice profile review */}
      {step === 2 && (
        <div>
          <p className="eyebrow mb-3">Your voice</p>
          <h1 className="display text-3xl md:text-4xl">Here&apos;s how we&apos;ll sound.</h1>
          {pending && !profile ? (
            <p className="mt-6 text-slate">Reading your voice and drafting a few samples...</p>
          ) : profile ? (
            <>
              <p className="mt-3 text-slate">Three follow-ups we drafted in your voice:</p>
              <div className="mt-5 flex flex-col gap-3">
                {profile.samples.map((s, i) => (
                  <div key={i} className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-sky px-4 py-3 text-[15px] leading-snug text-ink">
                    {s}
                  </div>
                ))}
              </div>
              <details className="mt-6 rounded-xl border border-slate/20 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate">Fine-tune the details</summary>
                <textarea
                  className={`${input} mt-3`}
                  rows={8}
                  value={masterPrompt}
                  onChange={(e) => setMasterPrompt(e.target.value)}
                />
                <p className="mt-2 text-xs text-mist">This is the guide we follow when writing your texts. Edit anything that isn&apos;t you.</p>
              </details>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex gap-2">
                  <button className={ghostBtn} onClick={() => goTo(1)}>Adjust answers</button>
                  <button className={ghostBtn} disabled={pending} onClick={runGenerate}>
                    {pending ? "..." : "Regenerate"}
                  </button>
                </div>
                <button
                  className={primaryBtn}
                  disabled={pending}
                  onClick={async () => {
                    setPending(true);
                    const res = await saveVoiceProfile({ questionnaire: q, masterPrompt, samples: profile.samples });
                    setPending(false);
                    if (!res.ok) return setError(res.error);
                    goTo(3);
                  }}
                >
                  Sounds like me
                </button>
              </div>
            </>
          ) : (
            <div className="mt-6">
              <button className={primaryBtn} onClick={runGenerate}>Try again</button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: sending schedule */}
      {step === 3 && (
        <div>
          <p className="eyebrow mb-3">When we text</p>
          <h1 className="display text-3xl md:text-4xl">Your sending hours.</h1>
          <p className="mt-3 text-slate">These are the times homeowners actually reply. Change anything you want. We never text before 8am or after 9pm regardless.</p>
          <div className="mt-6 flex flex-col gap-2">
            {windows.map((w, i) => (
              <div key={w.day_of_week} className="flex items-center gap-3 rounded-xl border border-slate/20 px-3 py-2.5">
                <label className="flex w-28 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={w.enabled}
                    onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))}
                  />
                  <span className={w.enabled ? "font-semibold" : "text-mist"}>{DAY_LABELS[w.day_of_week]}</span>
                </label>
                <input type="time" className="rounded-lg border border-slate/20 px-2 py-1.5 disabled:opacity-40" value={w.start_time} disabled={!w.enabled} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))} />
                <span className="text-mist">to</span>
                <input type="time" className="rounded-lg border border-slate/20 px-2 py-1.5 disabled:opacity-40" value={w.end_time} disabled={!w.enabled} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))} />
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-between">
            <button className={ghostBtn} onClick={() => goTo(2)}>Back</button>
            <button
              className={primaryBtn}
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const res = await saveSchedule(windows);
                setPending(false);
                if (!res.ok) return setError(res.error);
                goTo(4);
              }}
            >
              {pending ? "Saving..." : "Continue"}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: done + coaching moment */}
      {step === 4 && (
        <div>
          <p className="eyebrow mb-3">You&apos;re set up</p>
          <h1 className="display text-3xl md:text-4xl">Your voice is ready.</h1>
          <p className="mt-3 text-slate">Next we&apos;ll turn on your texting number and quote forwarding. That part is coming right up.</p>
          <div className="card mt-6 p-5">
            <p className="text-sm font-semibold text-ink">One habit that doubles your results</p>
            <p className="mt-2 text-sm leading-relaxed text-slate">
              Ask every lead: &quot;What&apos;s the best number to text your quote to?&quot; A number you can text is a lead ReKnock can chase. You can even give out your ReKnock number so the whole conversation lives in one thread.
            </p>
          </div>
          <div className="mt-8 flex justify-end">
            <button
              className={primaryBtn}
              disabled={pending}
              onClick={async () => {
                setPending(true);
                await finishOnboarding();
              }}
            >
              {pending ? "Finishing..." : "Go to my dashboard"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
