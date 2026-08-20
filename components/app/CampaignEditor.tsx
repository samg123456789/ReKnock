"use client";

import { useState } from "react";
import { saveCampaignSteps, previewStepMessage } from "@/lib/campaign-actions";
import { STEP_INTENT_OPTIONS, MANUAL_STEP_VALUE, MANUAL_STEP_LABEL, type CampaignStep } from "@/lib/campaign";
import Switch from "@/components/ui/Switch";

const input = "w-full rounded-xl border border-slate/20 px-4 py-2.5 text-sm outline-none focus:border-blue";

// Editor-local step: `mode` is the dropdown value - one of the preset intent
// values, a legacy free-typed intent (kept selectable so old campaigns load
// intact), or the manual sentinel meaning the template is the message.
type EditorStep = CampaignStep & { mode: string };

function toEditorStep(s: CampaignStep): EditorStep {
  const mode = s.template?.trim() ? MANUAL_STEP_VALUE : s.intent?.trim() || STEP_INTENT_OPTIONS[0].value;
  return { ...s, enabled: s.enabled !== false, mode };
}

function toCampaignStep(s: EditorStep): CampaignStep {
  const manual = s.mode === MANUAL_STEP_VALUE;
  return {
    day_offset: s.day_offset,
    intent: manual ? undefined : s.mode,
    template: manual ? s.template?.trim() || undefined : undefined,
    enabled: s.enabled,
  };
}

export default function CampaignEditor({ initialSteps }: { initialSteps: CampaignStep[] }) {
  const [steps, setSteps] = useState<EditorStep[]>(initialSteps.map(toEditorStep));
  const [previews, setPreviews] = useState<Record<number, { loading: boolean; text: string | null; error: string | null }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<EditorStep>) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setSaved(false);
  }

  async function preview(i: number) {
    const s = steps[i];
    const manual = s.mode === MANUAL_STEP_VALUE;
    setPreviews((p) => ({ ...p, [i]: { loading: true, text: null, error: null } }));
    const res = await previewStepMessage({ intent: manual ? "" : s.mode, template: manual ? (s.template ?? "") : "", stepIndex: i, dayOffset: s.day_offset });
    setPreviews((p) => ({ ...p, [i]: { loading: false, text: res.ok ? res.data : null, error: res.ok ? null : res.error } }));
  }

  async function save() {
    const missing = steps.findIndex((s) => s.enabled !== false && s.mode === MANUAL_STEP_VALUE && !s.template?.trim());
    if (missing >= 0) return setError(`Follow-up ${missing + 1} is set to "${MANUAL_STEP_LABEL}" but the message is empty. Write it or pick a purpose from the list.`);
    setSaving(true);
    setError(null);
    const res = await saveCampaignSteps(steps.map(toCampaignStep));
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
          <div key={i} className={`rounded-2xl border p-6 transition-opacity ${on ? "border-sky-line bg-white" : "border-slate/15 bg-slate/5 opacity-70"}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-ink">Follow-up {i + 1}</h3>
              <Switch checked={on} onChange={(v) => update(i, { enabled: v })} label={on ? "On" : "Off"} />
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-mist">Send this many days after the quote</span>
                <input className={input} type="number" min={0} max={365} value={s.day_offset} onChange={(e) => update(i, { day_offset: Math.max(0, Math.round(Number(e.target.value) || 0)) })} disabled={!on} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-mist">What this message is for</span>
                <select className={input} value={s.mode} onChange={(e) => update(i, { mode: e.target.value })} disabled={!on}>
                  {STEP_INTENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  {s.mode !== MANUAL_STEP_VALUE && !STEP_INTENT_OPTIONS.some((o) => o.value === s.mode) ? <option value={s.mode}>{s.mode}</option> : null}
                  <option value={MANUAL_STEP_VALUE}>{MANUAL_STEP_LABEL}</option>
                </select>
              </label>
            </div>

            {s.mode === MANUAL_STEP_VALUE ? (
              <label className="mt-4 flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-mist">Your exact words</span>
                <textarea className={input} rows={2} value={s.template ?? ""} onChange={(e) => update(i, { template: e.target.value })} disabled={!on} maxLength={320} placeholder="This sends word for word. Use {first_name}, {job}, {amount}." />
              </label>
            ) : null}

            {on ? (
              <div className="mt-4">
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
