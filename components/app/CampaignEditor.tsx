"use client";

import { useState } from "react";
import { saveCampaignSteps, previewStepMessage } from "@/lib/campaign-actions";
import { STEP_INTENT_PRESETS, type CampaignStep } from "@/lib/campaign";

const input = "w-full rounded-lg border border-slate/20 px-3 py-2 text-sm outline-none focus:border-blue";

export default function CampaignEditor({ initialSteps }: { initialSteps: CampaignStep[] }) {
  const [steps, setSteps] = useState<CampaignStep[]>(initialSteps.map((s) => ({ ...s, enabled: s.enabled !== false })));
  const [previews, setPreviews] = useState<Record<number, { loading: boolean; text: string | null; error: string | null }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<CampaignStep>) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setSaved(false);
  }

  async function preview(i: number) {
    const s = steps[i];
    setPreviews((p) => ({ ...p, [i]: { loading: true, text: null, error: null } }));
    const res = await previewStepMessage({ intent: s.intent ?? "", template: s.template ?? "", stepIndex: i, dayOffset: s.day_offset });
    setPreviews((p) => ({ ...p, [i]: { loading: false, text: res.ok ? res.data : null, error: res.ok ? null : res.error } }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const res = await saveCampaignSteps(steps);
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setSaved(true);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      {steps.map((s, i) => {
        const pv = previews[i];
        const on = s.enabled !== false;
        return (
          <div key={i} className={`rounded-2xl border p-4 transition-opacity ${on ? "border-sky-line bg-white" : "border-slate/15 bg-slate/5 opacity-70"}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">Follow-up {i + 1}</h3>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate">
                {on ? "On" : "Off"}
                <input type="checkbox" checked={on} onChange={(e) => update(i, { enabled: e.target.checked })} />
              </label>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-mist">Send this many days after the quote</span>
                <input className={input} type="number" min={0} max={365} value={s.day_offset} onChange={(e) => update(i, { day_offset: Math.max(0, Math.round(Number(e.target.value) || 0)) })} disabled={!on} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-mist">What this message is for</span>
                <input className={input} list={`intents-${i}`} value={s.intent ?? ""} onChange={(e) => update(i, { intent: e.target.value })} disabled={!on} placeholder="gentle check-in" />
                <datalist id={`intents-${i}`}>{STEP_INTENT_PRESETS.map((p) => <option key={p} value={p} />)}</datalist>
              </label>
            </div>

            <label className="mt-3 flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-mist">Your exact words (optional)</span>
              <textarea className={input} rows={2} value={s.template ?? ""} onChange={(e) => update(i, { template: e.target.value })} disabled={!on} maxLength={320} placeholder="Leave blank and we write it in your voice. Use {first_name}, {job}, {amount}." />
            </label>

            {on ? (
              <div className="mt-3">
                <button type="button" onClick={() => preview(i)} disabled={pv?.loading} className="cursor-pointer text-xs font-semibold text-blue hover:underline disabled:opacity-50">
                  {pv?.loading ? "Drafting a sample..." : "Preview this message"}
                </button>
                {pv?.text ? <div className="mt-2 max-w-[90%] rounded-2xl rounded-bl-sm bg-sky px-4 py-3 text-[15px] leading-snug text-ink">{pv.text}</div> : null}
                {pv?.error ? <p className="mt-2 text-xs text-red-700">{pv.error}</p> : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button type="button" disabled={saving} onClick={save} className="btn btn-primary">
          {saving ? "Saving..." : "Save campaign"}
        </button>
        {saved ? <span className="text-sm text-mint">Saved. New quotes use this schedule.</span> : null}
      </div>
      <p className="text-xs text-mist">Changes apply to quotes you add from now on. Quotes already being chased keep their current schedule.</p>
    </div>
  );
}
