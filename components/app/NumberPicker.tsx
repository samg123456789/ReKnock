"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchAvailableNumbers, claimNumber, type AvailableNumber } from "@/lib/provisioning-actions";

function prettyUs(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

function statusLabel(status: string): string {
  if (status === "active") return "Live";
  if (status === "pending_10dlc") return "Activating";
  if (status === "failed") return "Needs attention";
  return "Reserved";
}

function FlowStep({ n, title, body, active = false, done = false }: { n: string; title: string; body: string; active?: boolean; done?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-mint/15 text-mint" : active ? "bg-blue text-white" : "bg-sky text-blue"}`}>
        {done ? "✓" : n}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate">{body}</p>
      </div>
    </div>
  );
}

// Pick-your-ReKnock-number flow. The primary home is the mandatory onboarding
// step (bare variant, onClaimed advances the wizard); the dashboard card
// remains as the fallback for accounts that predate that step.
export default function NumberPicker({
  phone,
  defaultAreaCode,
  bare = false,
  onClaimed,
}: {
  phone: { e164: string | null; status: string } | null;
  defaultAreaCode: string;
  bare?: boolean;
  onClaimed?: () => void;
}) {
  const router = useRouter();
  const [areaCode, setAreaCode] = useState(defaultAreaCode);
  const [numbers, setNumbers] = useState<AvailableNumber[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (phone && !bare) {
    if (phone.status === "active") return null;
    return (
      <div className="ai-panel mt-6 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <span className="ai-chip">Number setup</span>
            <h3 className="mt-3 text-lg font-bold text-ink">Your ReKnock number is activating</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate">
              {phone.e164 ? `${prettyUs(phone.e164)} is reserved for you.` : "Your number is reserved."} Carriers review business texting numbers before real SMS can go out. You can still add quotes, edit follow-ups, and prepare the inbox while that finishes.
            </p>
          </div>
          <span className="rounded-full bg-amber/15 px-3 py-1 text-xs font-bold text-amber">{statusLabel(phone.status)}</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <FlowStep n="1" title="Reserved" body="The number belongs to your ReKnock account." done />
          <FlowStep n="2" title="Carrier activation" body="Anti-spam registration finishes before first send." active />
          <FlowStep n="3" title="Go live" body="Follow-ups send, replies hit email/inbox, calls forward." />
        </div>
      </div>
    );
  }

  async function search() {
    setBusy(true);
    setErr(null);
    setNumbers(null);
    const res = await searchAvailableNumbers(areaCode);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    setNumbers(res.data);
  }

  async function claim(e164: string) {
    setClaiming(e164);
    setErr(null);
    const res = await claimNumber(e164);
    setClaiming(null);
    if (!res.ok) return setErr(res.error);
    if (onClaimed) onClaimed();
    else router.refresh();
  }

  return (
    <div className={bare ? "mt-6" : "ai-panel mt-6 p-5"}>
      {!bare ? (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <span className="ai-chip">Local AI follow-up line</span>
              <h3 className="mt-3 text-lg font-bold text-ink">Pick your ReKnock number</h3>
            </div>
            <span className="rounded-full bg-sky px-3 py-1 text-xs font-bold text-blue">Step 1 of 3</span>
          </div>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate">
            This is the local number homeowners see when ReKnock follows up. After you choose it, carriers activate it for business texting. Nothing sends until the line is ready.
          </p>
        </>
      ) : null}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <FlowStep n="1" title="Choose a local line" body="Search your area code and pick the number you like." active />
        <FlowStep n="2" title="We reserve it" body="The number attaches to your account and inbox." />
        <FlowStep n="3" title="Activation finishes" body="Texts and calls go live after carrier checks." />
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className="rk-input w-full text-center text-base sm:w-28"
          inputMode="numeric"
          maxLength={3}
          value={areaCode}
          onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, ""))}
          placeholder="516"
          aria-label="Area code"
        />
        <button
          type="button"
          disabled={busy || areaCode.length !== 3}
          onClick={search}
          className="btn btn-primary"
        >
          {busy ? "Searching..." : "Find numbers"}
        </button>
      </div>
      {err ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700">
          {err} Your setup is saved. If this keeps happening, try a nearby area code.
        </div>
      ) : null}
      {numbers ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {numbers.map((n) => (
            <button
              key={n.e164}
              type="button"
              disabled={claiming !== null}
              onClick={() => claim(n.e164)}
              className="cursor-pointer rounded-2xl border border-sky-line bg-white px-4 py-3 text-left transition-colors hover:border-blue hover:bg-sky/40 disabled:opacity-50"
            >
              <span className="font-semibold text-ink">{prettyUs(n.e164)}</span>
              <span className="block text-xs text-mist">
                {claiming === n.e164 ? "Claiming..." : [n.locality, n.region].filter(Boolean).join(", ") || "Local number"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
