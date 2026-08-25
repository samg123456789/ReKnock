"use client";

import { useState } from "react";
import { saveCampaignSteps, previewStepMessage } from "@/lib/campaign-actions";
import { DEFAULT_CAMPAIGN_STEPS, STEP_INTENT_OPTIONS, MANUAL_STEP_VALUE, MANUAL_STEP_LABEL, type CampaignStep } from "@/lib/campaign";
import Switch from "@/components/ui/Switch";

const input = "rk-input text-sm";

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
    preferred_time: s.preferred_time || undefined,
    intent: manual ? undefined : s.mode,
    template: manual ? s.template?.trim() || undefined : undefined,
    enabled: s.enabled,
  };
}

export default function CampaignEditor({ campaignId, campaignName, isDefault, initialSteps }: { campaignId: string; campaignName: string; isDefault: boolean; initialSteps: CampaignStep[] }) {
  const [steps, setSteps] = useState<EditorStep[]>(initialSteps.map(toEditorStep));
  const [previews, setPreviews] = useState<Record<number, { loading: boolean; text: string | null; error: string | null }>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, patch: Partial<EditorStep>) {
    setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));
    setSaved(false);
  }

  function addStep() {
    if (steps.length >= 8) return;
    const previous = steps[steps.length - 1];
    setSteps((prev) => [...prev, {
      day_offset: (previous?.day_offset ?? 0) + 5,
      preferred_time: previous?.preferred_time ?? "10:00",
      intent: "gentle check-in",
      enabled: true,
      mode: "gentle check-in",
    }]);
    setSaved(false);
  }

  function removeStep(i: number) {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, j) => j !== i));
    setSaved(false);
  }

  function duplicateStep(i: number) {
    if (steps.length >= 8) return;
    const source = steps[i];
    const copy = { ...source, day_offset: source.day_offset + 3 };
    setSteps((prev) => [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)]);
    setSaved(false);
  }

  function resetRecommended() {
    setSteps(DEFAULT_CAMPAIGN_STEPS.map(toEditorStep));
    setPreviews({});
    setSaved(false);
    setError(null);
  }

  function moveStep(i: number, direction: -1 | 1) {
    const next = i + direction;
    if (next < 0 || next >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[i], copy[next]] = [copy[next], copy[i]];
      return copy;
    });
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
    if (missing >= 0) return setError(`Touch ${missing + 1} is set to "${MANUAL_STEP_LABEL}" but the message is empty. Write it or pick a purpose from the list.`);
    setSaving(true);
    setError(null);
    const res = await saveCampaignSteps(campaignId, steps.map(toCampaignStep));
    setSaving(false);
    if (!res.ok) return setError(res.error);
    setSaved(true);
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="surface-card-compact grid gap-3 bg-sky/45 sm:grid-cols-3">
        <div><p className="surface-label">Plan shape</p><p className="mt-1 text-sm font-semibold text-ink">{steps.filter((s) => s.enabled !== false).length} active touches</p></div>
        <div><p className="surface-label">Timeline</p><p className="mt-1 text-sm font-semibold text-ink">{steps.filter((s) => s.enabled !== false).reduce((max, s) => Math.max(max, s.day_offset), 0)} days</p></div>
        <div><p className="surface-label">Safety rule</p><p className="mt-1 text-sm font-semibold text-ink">Stops when they reply</p></div>
      </div>
      {steps.map((s, i) => {
        const pv = previews[i];
        const on = s.enabled !== false;
        return (
          <div key={i} className={`app-panel p-6 transition-opacity ${on ? "" : "opacity-70"}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="surface-label">{campaignName}{isDefault ? " · Default" : ""}</p>
                <h3 className="mt-1 font-semibold text-ink">Touch {i + 1}</h3>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Move touch up" disabled={i === 0} onClick={() => moveStep(i, -1)} className="cursor-pointer rounded-lg px-2 py-1 text-xs text-mist hover:bg-sky hover:text-blue disabled:cursor-not-allowed disabled:opacity-30">↑</button>
                <button type="button" aria-label="Move touch down" disabled={i === steps.length - 1} onClick={() => moveStep(i, 1)} className="cursor-pointer rounded-lg px-2 py-1 text-xs text-mist hover:bg-sky hover:text-blue disabled:cursor-not-allowed disabled:opacity-30">↓</button>
                <button type="button" onClick={() => removeStep(i)} disabled={steps.length <= 1} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-red-600/70 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30">Remove</button>
                <button type="button" onClick={() => duplicateStep(i)} disabled={steps.length >= 8} className="cursor-pointer rounded-lg px-2 py-1 text-xs font-semibold text-blue hover:bg-sky disabled:cursor-not-allowed disabled:opacity-30">Duplicate</button>
                <Switch checked={on} onChange={(v) => update(i, { enabled: v })} label={on ? "On" : "Off"} />
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-mist">Send this many days after the quote</span>
                <input className={input} type="number" min={0} max={365} value={s.day_offset} onChange={(e) => update(i, { day_offset: Math.max(0, Math.round(Number(e.target.value) || 0)) })} disabled={!on} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-mist">Preferred send time</span>
                <input className={input} type="time" value={s.preferred_time ?? ""} onChange={(e) => update(i, { preferred_time: e.target.value || undefined })} disabled={!on} />
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
                <span className="text-right text-[11px] text-mist">{(s.template ?? "").length}/320 characters</span>
              </label>
            ) : null}

            {on ? (
              <div className="mt-4">
                <button type="button" onClick={() => preview(i)} disabled={pv?.loading} className="cursor-pointer text-xs font-semibold text-blue hover:underline disabled:opacity-50">
                  {pv?.loading ? "Drafting a sample..." : "Preview this message"}
                </button>
                {pv?.text ? <div className="mt-3 max-w-[90%] whitespace-pre-line break-words rounded-2xl rounded-bl-sm bg-sky px-4 py-3 text-[15px] leading-snug text-ink">{pv.text}</div> : null}
                {pv?.error ? <p className="mt-2 text-xs text-red-700">{pv.error}</p> : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {error ? <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={saving} onClick={save} className="btn btn-primary">
          {saving ? "Saving..." : "Save message campaign"}
        </button>
        <button type="button" disabled={steps.length >= 8} onClick={addStep} className="btn btn-ghost">+ Add a touch</button>
        <button type="button" onClick={resetRecommended} className="btn btn-ghost">Reset to recommended</button>
        {saved ? <span className="text-sm text-mint">Saved. New quotes use this schedule.</span> : null}
      </div>
      <p className="text-xs text-mist">Choose a preferred time or leave it blank for ReKnock&apos;s best-time default. We always stay inside your sending hours. Changes apply to new quotes; active quotes keep their current schedule.</p>
    </div>
  );
}
