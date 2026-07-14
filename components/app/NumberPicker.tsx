"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { searchAvailableNumbers, claimNumber, type AvailableNumber } from "@/lib/provisioning-actions";

function prettyUs(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
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
      <div className="card mt-6 p-5">
        <p className="font-semibold text-ink">Your ReKnock number: {phone.e164 ? prettyUs(phone.e164) : "reserved"}</p>
        <p className="mt-1 text-sm text-slate">
          Carriers are activating it now (usually 1 to 2 days). Everything else already works: add quotes, edit your
          follow-ups, and we will start texting the moment it goes live.
        </p>
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
    <div className={bare ? "" : "card mt-6 p-5"}>
      {!bare ? (
        <>
          <p className="font-semibold text-ink">Pick your ReKnock number</p>
          <p className="mt-1 text-sm text-slate">
            This is the local number your customers will see. Pick one in your area code so it feels like you.
          </p>
        </>
      ) : null}
      <div className="mt-3 flex items-center gap-2">
        <input
          className="w-24 rounded-xl border border-slate/20 px-3 py-2 text-center text-base outline-none focus:border-blue"
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
      {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
      {numbers ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {numbers.map((n) => (
            <button
              key={n.e164}
              type="button"
              disabled={claiming !== null}
              onClick={() => claim(n.e164)}
              className="cursor-pointer rounded-xl border border-slate/20 px-4 py-3 text-left transition-colors hover:border-blue hover:bg-sky/40 disabled:opacity-50"
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
