"use client";

import { useEffect, useRef, useState } from "react";
import TradePicker from "@/components/onboarding/TradePicker";
import type { VoiceQuestionnaire, VoiceProfileResult } from "@/lib/prompts/voice-profile";
import { saveCompanyBasics, saveSchedule, generateVoiceProfile, saveVoiceProfile } from "@/lib/onboarding-actions";
import { setRelayCell, logFeatureInterest } from "@/lib/settings-actions";
import { createBillingPortalSession } from "@/lib/billing-actions";

type Basics = { name: string; website: string; description: string; heard_about: string; avg_quote_amount: string; quotes_per_month: string };
type Window = { day_of_week: number; start_time: string; end_time: string; enabled: boolean };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const US_MARKETS = [
  ["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"], ["America/Los_Angeles", "Pacific"], ["America/Anchorage", "Alaska"], ["America/Honolulu", "Hawaii"],
] as const;
const COMING_SOON = ["Analytics", "Integrations", "WhatsApp channel", "Email channel", "Team seats"];

const input = "w-full rounded-xl border border-slate/20 px-4 py-2.5 text-base outline-none focus:border-blue";

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card mt-4 scroll-mt-24 p-5">
      <h2 className="display text-lg">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function SaveBtn({ onClick, state }: { onClick: () => void; state: "" | "saving" | "saved" | string }) {
  return (
    <div className="mt-3 flex items-center gap-3">
      <button type="button" onClick={onClick} disabled={state === "saving"} className="cursor-pointer rounded-xl bg-blue px-6 py-2.5 font-semibold text-white hover:bg-blue-deep disabled:opacity-60">
        {state === "saving" ? "Saving..." : "Save"}
      </button>
      {state === "saved" ? <span className="text-sm text-mint">Saved</span> : null}
      {state && state !== "saving" && state !== "saved" ? <span className="text-sm text-red-700">{state}</span> : null}
    </div>
  );
}

export default function SettingsClient(props: {
  initialBasics: Basics;
  initialTrades: string[];
  initialTimezone: string;
  initialWindows: Window[] | null;
  questionnaire: VoiceQuestionnaire | null;
  masterPrompt: string;
  samples: string[];
  relayCell: string;
  forwardingAddress: string;
  numberStatus: string | null;
  numberE164: string | null;
}) {
  const [basics, setBasics] = useState(props.initialBasics);
  const [trades, setTrades] = useState(props.initialTrades);
  const [basicsState, setBasicsState] = useState("");

  const [timezone, setTimezone] = useState(props.initialTimezone);
  const [windows, setWindows] = useState<Window[]>(
    props.initialWindows ?? DAY_LABELS.map((_, d) => ({ day_of_week: d, start_time: "09:30", end_time: "18:30", enabled: d >= 1 && d <= 5 })),
  );
  const [schedState, setSchedState] = useState("");

  const q: VoiceQuestionnaire = props.questionnaire ?? {
    texting_style: "short_casual", casing: "sentence", uses_first_name: true, uses_emojis: false, uses_exclamation: false, sign_off: "", samples: [], never_say: "",
  };
  const [masterPrompt, setMasterPrompt] = useState(props.masterPrompt);
  const [samples, setSamples] = useState(props.samples);
  const [voiceState, setVoiceState] = useState("");
  const [regenPending, setRegenPending] = useState(false);

  const [cell, setCell] = useState(props.relayCell);
  const [cellState, setCellState] = useState("");
  // Deep link from the dashboard's "Add your cell number": land on the field,
  // not just the page.
  const cellInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (window.location.hash === "#relay-cell") {
      document.getElementById("relay-cell")?.scrollIntoView({ behavior: "smooth", block: "center" });
      cellInputRef.current?.focus();
    }
  }, []);
  const [copied, setCopied] = useState(false);
  const [notified, setNotified] = useState<string[]>([]);

  async function run(setState: (s: string) => void, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setState("saving");
    const res = await fn();
    if (!res.ok) return setState(res.error ?? "Could not save.");
    setState("saved");
    setTimeout(() => setState(""), 2000);
  }

  return (
    <div>
      <Card title="Company profile">
        <div className="flex flex-col gap-3">
          <input className={input} value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} placeholder="Business name" />
          <input className={input} value={basics.website} onChange={(e) => setBasics({ ...basics, website: e.target.value })} placeholder="Website" />
          <TradePicker value={trades} onChange={setTrades} />
          <textarea className={input} rows={2} value={basics.description} onChange={(e) => setBasics({ ...basics, description: e.target.value })} placeholder="What you do" />
          <div className="flex gap-3">
            <input className={input} value={basics.avg_quote_amount} onChange={(e) => setBasics({ ...basics, avg_quote_amount: e.target.value })} placeholder="Typical quote $" />
            <input className={input} value={basics.quotes_per_month} onChange={(e) => setBasics({ ...basics, quotes_per_month: e.target.value })} placeholder="Quotes / month" />
          </div>
        </div>
        <SaveBtn state={basicsState} onClick={() => run(setBasicsState, () => saveCompanyBasics({ ...basics, trades }))} />
      </Card>

      <Card title="Sending hours">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-slate">Market (timezone)</span>
          <select className={input} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
            {US_MARKETS.map(([tz, label]) => <option key={tz} value={tz}>{label}</option>)}
          </select>
        </label>
        <div className="mt-2 flex flex-col gap-1.5">
          {windows.map((w, i) => (
            <div key={w.day_of_week} className="flex items-center gap-2 text-sm">
              <label className="flex w-20 items-center gap-2">
                <input type="checkbox" checked={w.enabled} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)))} />
                <span className={w.enabled ? "font-semibold" : "text-mist"}>{DAY_LABELS[w.day_of_week]}</span>
              </label>
              <input type="time" className="rounded-lg border border-slate/20 px-2 py-1 disabled:opacity-40" value={w.start_time} disabled={!w.enabled} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, start_time: e.target.value } : x)))} />
              <span className="text-mist">to</span>
              <input type="time" className="rounded-lg border border-slate/20 px-2 py-1 disabled:opacity-40" value={w.end_time} disabled={!w.enabled} onChange={(e) => setWindows(windows.map((x, j) => (j === i ? { ...x, end_time: e.target.value } : x)))} />
            </div>
          ))}
        </div>
        <button type="button" className="mt-2 cursor-pointer text-sm text-blue underline" onClick={() => setWindows(windows.map((x) => (x.day_of_week >= 1 && x.day_of_week <= 5 ? { ...x, start_time: windows[1].start_time, end_time: windows[1].end_time } : x)))}>
          Use Monday&apos;s hours for all weekdays
        </button>
        <SaveBtn state={schedState} onClick={() => run(setSchedState, () => saveSchedule(windows, timezone))} />
      </Card>

      <Card title="Your voice">
        {samples.length ? (
          <div className="flex flex-col gap-2">
            {samples.map((s, i) => <div key={i} className="max-w-[90%] self-start rounded-2xl rounded-bl-sm bg-sky px-3.5 py-2 text-[15px] text-ink">{s}</div>)}
          </div>
        ) : null}
        <label className="mt-3 block text-sm font-semibold text-slate">Voice guide</label>
        <textarea className={`${input} mt-1`} rows={7} value={masterPrompt} onChange={(e) => setMasterPrompt(e.target.value)} />
        <div className="mt-3 flex items-center gap-3">
          <button type="button" onClick={() => run(setVoiceState, () => saveVoiceProfile({ questionnaire: q, masterPrompt, samples }))} disabled={voiceState === "saving"} className="cursor-pointer rounded-xl bg-blue px-6 py-2.5 font-semibold text-white hover:bg-blue-deep disabled:opacity-60">
            {voiceState === "saving" ? "Saving..." : "Save voice"}
          </button>
          <button type="button" disabled={regenPending} onClick={async () => { setRegenPending(true); const r = await generateVoiceProfile(q); setRegenPending(false); if (r.ok) { const d = r.data as VoiceProfileResult; setMasterPrompt(d.master_prompt); setSamples(d.samples); } }} className="cursor-pointer rounded-xl border border-slate/20 px-5 py-2.5 font-semibold text-slate hover:border-blue">
            {regenPending ? "Rewriting..." : "Regenerate"}
          </button>
          {voiceState === "saved" ? <span className="text-sm text-mint">Saved</span> : null}
          {voiceState && voiceState !== "saving" && voiceState !== "saved" ? <span className="text-sm text-red-700">{voiceState}</span> : null}
        </div>
      </Card>

      <Card id="relay-cell" title="Reply relay number">
        <p className="text-sm text-slate">When a homeowner replies, we text you here so you can take over.</p>
        <input ref={cellInputRef} className={`${input} mt-2`} type="tel" value={cell} onChange={(e) => setCell(e.target.value)} placeholder="(555) 123-4567" />
        <SaveBtn state={cellState} onClick={() => run(setCellState, () => setRelayCell(cell))} />
      </Card>

      <Card title="Your ReKnock line">
        <p className="text-sm text-slate">
          Texting number: <span className="font-semibold text-ink">{props.numberE164 ?? (props.numberStatus ? props.numberStatus : "activating")}</span>
        </p>
        {props.forwardingAddress ? (
          <div className="mt-2">
            <p className="text-sm text-slate">Forward or BCC any quote email here:</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="rounded-lg bg-sky px-3 py-1.5 text-sm text-blue-ink">{props.forwardingAddress}</code>
              <button type="button" className="cursor-pointer text-sm text-blue underline" onClick={() => { navigator.clipboard.writeText(props.forwardingAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card title="Billing">
        <form action={createBillingPortalSession}>
          <button type="submit" className="cursor-pointer rounded-xl border border-slate/20 px-6 py-2.5 font-semibold text-slate hover:border-blue hover:text-blue">
            Manage billing
          </button>
        </form>
      </Card>

      <Card title="Coming soon">
        <div className="flex flex-col gap-2">
          {COMING_SOON.map((f) => (
            <div key={f} className="flex items-center justify-between rounded-xl border border-slate/15 px-4 py-2.5 opacity-80">
              <span className="text-slate">{f}</span>
              {notified.includes(f) ? (
                <span className="text-sm text-mint">We&apos;ll let you know</span>
              ) : (
                <button type="button" className="cursor-pointer text-sm font-semibold text-blue" onClick={async () => { setNotified((n) => [...n, f]); await logFeatureInterest(f); }}>
                  Notify me
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
