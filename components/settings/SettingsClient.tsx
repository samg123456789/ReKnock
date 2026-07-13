"use client";

import { useEffect, useRef, useState } from "react";
import TradePicker from "@/components/onboarding/TradePicker";
import type { VoiceQuestionnaire, VoiceProfileResult } from "@/lib/prompts/voice-profile";
import { saveCompanyBasics, saveSchedule, generateVoiceProfile, saveVoiceProfile } from "@/lib/onboarding-actions";
import { requestRelayCellCode, verifyRelayCellCode, addSenderEmail, removeSenderEmail, logFeatureInterest } from "@/lib/settings-actions";
import { createBillingPortalSession } from "@/lib/billing-actions";

type Basics = { name: string; website: string; description: string; heard_about: string; avg_quote_amount: string; quotes_per_month: string };
type Window = { day_of_week: number; start_time: string; end_time: string; enabled: boolean };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const US_MARKETS = [
  ["America/New_York", "Eastern"], ["America/Chicago", "Central"], ["America/Denver", "Mountain"],
  ["America/Phoenix", "Arizona"], ["America/Los_Angeles", "Pacific"], ["America/Anchorage", "Alaska"], ["America/Honolulu", "Hawaii"],
] as const;
const COMING_SOON: [string, string][] = [
  ["Analytics", "Track reply rates and win-backs at a glance."],
  ["Integrations", "Connect your CRM and other tools."],
  ["WhatsApp channel", "Follow up over WhatsApp, not just SMS."],
  ["Email channel", "Send follow-ups by email too."],
  ["Team seats", "Add teammates to your account."],
];

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
      <button type="button" onClick={onClick} disabled={state === "saving"} className="btn btn-primary">
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
  referralCode: string;
  senderEmails: { id: string; email: string; verified: boolean }[];
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
  const [cellStage, setCellStage] = useState<"idle" | "code_sent" | "verified">("idle");
  const [cellCode, setCellCode] = useState("");
  const [senders, setSenders] = useState(props.senderEmails);
  const [newSender, setNewSender] = useState("");
  const [senderState, setSenderState] = useState("");
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
  const [refCopied, setRefCopied] = useState(false);
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
          <button type="button" onClick={() => run(setVoiceState, () => saveVoiceProfile({ questionnaire: q, masterPrompt, samples }))} disabled={voiceState === "saving"} className="btn btn-primary">
            {voiceState === "saving" ? "Saving..." : "Save voice"}
          </button>
          <button type="button" disabled={regenPending} onClick={async () => { setRegenPending(true); const r = await generateVoiceProfile(q); setRegenPending(false); if (r.ok) { const d = r.data as VoiceProfileResult; setMasterPrompt(d.master_prompt); setSamples(d.samples); } }} className="btn btn-ghost">
            {regenPending ? "Rewriting..." : "Regenerate"}
          </button>
          {voiceState === "saved" ? <span className="text-sm text-mint">Saved</span> : null}
          {voiceState && voiceState !== "saving" && voiceState !== "saved" ? <span className="text-sm text-red-700">{voiceState}</span> : null}
        </div>
      </Card>

      <Card id="relay-cell" title="Reply relay number">
        <p className="text-sm text-slate">When a homeowner replies, we text you here so you can take over. We verify it with a quick code so replies never go to the wrong phone.</p>
        <input
          ref={cellInputRef}
          className={`${input} mt-2`}
          type="tel"
          value={cell}
          onChange={(e) => { setCell(e.target.value); setCellStage("idle"); setCellState(""); }}
          placeholder="(555) 123-4567"
        />
        {cellStage === "code_sent" ? (
          <div className="mt-3">
            <p className="text-sm font-semibold text-slate">Enter the 6-digit code we just texted to {cell}.</p>
            <div className="mt-2 flex items-center gap-3">
              <input
                className={`${input} max-w-[10rem] text-center tracking-[0.3em]`}
                inputMode="numeric"
                maxLength={6}
                value={cellCode}
                onChange={(e) => setCellCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
              />
              <button
                type="button"
                disabled={cellState === "saving" || cellCode.length !== 6}
                onClick={() => run(setCellState, async () => {
                  const res = await verifyRelayCellCode(cellCode);
                  if (res.ok) { setCellStage("verified"); setCellCode(""); }
                  return res;
                })}
                className="btn btn-primary"
              >
                {cellState === "saving" ? "Checking..." : "Verify"}
              </button>
              <button type="button" className="cursor-pointer text-sm text-slate underline" onClick={() => run(setCellState, () => requestRelayCellCode(cell))}>
                Resend code
              </button>
            </div>
            {cellState && cellState !== "saving" && cellState !== "saved" ? <p className="mt-2 text-sm text-red-600">{cellState}</p> : null}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={cellState === "saving" || !cell.trim() || (cellStage === "verified" ? false : cell === props.relayCell && !!props.relayCell)}
              onClick={() => run(setCellState, async () => {
                const res = await requestRelayCellCode(cell);
                if (res.ok) setCellStage("code_sent");
                return res;
              })}
              className="btn btn-primary"
            >
              {cellState === "saving" ? "Texting you a code..." : "Text me a code"}
            </button>
            {cellStage === "verified" || (props.relayCell && cell === props.relayCell) ? (
              <span className="rounded-full bg-mint/15 px-2.5 py-1 text-xs font-semibold text-mint">Verified</span>
            ) : null}
            {cellState && cellState !== "saving" && cellState !== "saved" ? <p className="text-sm text-red-600">{cellState}</p> : null}
          </div>
        )}
      </Card>

      <Card title="Your ReKnock line">
        <p className="text-sm text-slate">
          Texting number: <span className="font-semibold text-ink">{props.numberE164 ?? (props.numberStatus ? props.numberStatus : "activating")}</span>
        </p>
      </Card>

      <Card id="forwarding" title="Quote forwarding">
        <p className="text-sm text-slate">Forward or BCC any quote email here and we start chasing it:</p>
        <div className="mt-1 flex items-center gap-2">
          <code className="rounded-lg bg-sky px-3 py-1.5 text-sm text-blue-ink">{props.forwardingAddress}</code>
          <button type="button" className="cursor-pointer text-sm text-blue underline" onClick={() => { navigator.clipboard.writeText(props.forwardingAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-4 text-sm font-semibold text-slate">We only accept mail from your verified emails:</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {senders.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 truncate text-ink">{s.email}</span>
              {s.verified ? (
                <span className="shrink-0 rounded-full bg-mint/15 px-2 py-0.5 text-[11px] font-semibold text-mint">Verified</span>
              ) : (
                <span className="shrink-0 rounded-full bg-amber/15 px-2 py-0.5 text-[11px] font-semibold text-amber">Check your inbox</span>
              )}
              {senders.length > 1 ? (
                <button
                  type="button"
                  className="ml-auto shrink-0 cursor-pointer text-xs text-slate underline hover:text-ink"
                  onClick={() => run(setSenderState, async () => {
                    const res = await removeSenderEmail(s.id);
                    if (res.ok) setSenders((cur) => cur.filter((x) => x.id !== s.id));
                    return res;
                  })}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <input
            className={`${input} max-w-xs`}
            type="email"
            value={newSender}
            onChange={(e) => setNewSender(e.target.value)}
            placeholder="Add another email you send from"
          />
          <button
            type="button"
            disabled={senderState === "saving" || !newSender.trim()}
            onClick={() => run(setSenderState, async () => {
              const res = await addSenderEmail(newSender);
              if (res.ok) {
                setSenders((cur) => [...cur, { id: `tmp-${Date.now()}`, email: newSender.trim().toLowerCase(), verified: false }]);
                setNewSender("");
              }
              return res;
            })}
            className="btn btn-ghost"
          >
            {senderState === "saving" ? "Adding..." : "Add"}
          </button>
        </div>
        {senderState && senderState !== "saving" && senderState !== "saved" ? <p className="mt-2 text-sm text-red-600">{senderState}</p> : null}
      </Card>

      {props.referralCode ? (
        <Card title="Give a month, get a month">
          <p className="text-sm text-slate">
            Know another contractor drowning in quotes that go quiet? When they sign up with your link and subscribe, you both get a free month.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 truncate rounded-lg bg-sky px-3 py-1.5 text-sm text-blue-ink">https://getreknock.com/?ref={props.referralCode}</code>
            <button
              type="button"
              className="shrink-0 cursor-pointer text-sm text-blue underline"
              onClick={() => { navigator.clipboard.writeText(`https://getreknock.com/?ref=${props.referralCode}`); setRefCopied(true); setTimeout(() => setRefCopied(false), 1500); }}
            >
              {refCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </Card>
      ) : null}

      <Card title="Billing">
        <form action={createBillingPortalSession}>
          <button type="submit" className="btn btn-ghost">
            Manage billing
          </button>
        </form>
      </Card>

      <Card title="Coming soon">
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {COMING_SOON.map(([f, desc]) => (
            <div key={f} className="flex flex-col rounded-xl border border-slate/15 p-4 opacity-90">
              <span className="font-semibold text-ink">{f}</span>
              <span className="mt-0.5 flex-1 text-sm text-slate">{desc}</span>
              {notified.includes(f) ? (
                <span className="mt-2.5 text-sm font-semibold text-mint">We&apos;ll let you know</span>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm mt-2.5 self-start"
                  onClick={async () => { setNotified((n) => [...n, f]); await logFeatureInterest(f); }}
                >
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
