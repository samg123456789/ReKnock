"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendManualMessage, setProspectStatus, updateProspect, deleteProspect, draftTouchPreview, saveTouchMessage, rescheduleTouch, deleteTouch, addTouch, createReminder, cancelReminder, type DraftResult, type TimeResult } from "@/lib/inbox-actions";
import { formatMoney } from "@/lib/format";
import StatusFilter from "@/components/ui/StatusFilter";

export type Conversation = { id: string; name: string; jobType: string; status: string; snippet: string; time: string; needsAttention: boolean };
export type ThreadMessage = { body: string; direction: "inbound" | "outbound"; status: string; createdAt: string };
export type ScheduledBubble = { id: string; label: string; iso: string };
export type ReminderItem = { id: string; remindAt: string; mode: "remind_me" | "auto_send"; note: string | null };
export type ProspectDetail = {
  id: string; name: string; firstName: string; lastName: string; jobType: string | null; status: string;
  phone: string | null; email: string | null; address: string | null;
  quoteAmount: number | null; quoteDate: string | null; source: string | null; notes: string | null;
};

const STATUS_LABEL: Record<string, string> = { new: "New", sequencing: "Chasing", replied: "Replied", won: "Won", lost: "Lost", opted_out: "Opted out", paused: "Paused" };
const FILTERS = [
  { key: "all", label: "All statuses" },
  { key: "attention", label: "Needs review" },
  { key: "replied", label: "Replied" },
  { key: "sequencing", label: "Chasing" },
  { key: "paused", label: "Paused" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "opted_out", label: "Opted out" },
] as const;

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function prettyDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function InboxClient({
  conversations,
  selectedId,
  thread,
  scheduled,
  reminders,
  prospect,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  thread: ThreadMessage[];
  scheduled: ScheduledBubble[];
  reminders: ReminderItem[];
  prospect: ProspectDetail | null;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusPending, startStatusTransition] = useTransition();
  // Optimistic status so the chip + controls flip the instant you click,
  // instead of waiting on the server action + a full inbox re-fetch.
  const [optimisticStatus, setOptimisticStatus] = useState<string | null>(null);
  // Clear the override once the refreshed server data arrives.
  useEffect(() => setOptimisticStatus(null), [prospect?.status]);
  const shownStatus = optimisticStatus ?? prospect?.status;
  const [showDetails, setShowDetails] = useState(false);
  const [editStep, setEditStep] = useState<ScheduledBubble | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [showAddTouch, setShowAddTouch] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.jobType.toLowerCase().includes(q)) return false;
      if (filter === "attention") return c.needsAttention;
      if (filter !== "all") return c.status === filter;
      return true;
    });
  }, [conversations, query, filter]);

  async function send() {
    if (!prospect) return;
    setPending(true);
    setError(null);
    const res = await sendManualMessage(prospect.id, body);
    setPending(false);
    if (!res.ok) return setError(res.error);
    setBody("");
    // Pausing the chase is a state change the user caused without asking for
    // it by name - it must be visible, with the undo in reach.
    if (res.paused) showToast(`Follow-ups paused for ${prospect.firstName || prospect.name} so we don't talk over you.`, prospect.id);
    router.refresh();
  }

  const [toast, setToast] = useState<{ text: string; prospectId: string } | null>(null);
  function showToast(text: string, prospectId: string) {
    setToast({ text, prospectId });
    window.clearTimeout((showToast as { t?: number }).t);
    (showToast as { t?: number }).t = window.setTimeout(() => setToast(null), 7000);
  }
  function resumeFromToast() {
    const id = toast?.prospectId;
    setToast(null);
    if (!id) return;
    startStatusTransition(async () => {
      await setProspectStatus(id, "sequencing");
      router.refresh();
    });
  }

  function changeStatus(status: string) {
    if (!prospect) return;
    setOptimisticStatus(status); // flip UI immediately
    startStatusTransition(async () => {
      await setProspectStatus(prospect.id, status);
      router.refresh();
    });
  }

  // Day separators over the thread.
  let lastDay = "";

  return (
    <div className="grid h-[calc(100dvh-4rem)] md:grid-cols-[340px_1fr]">
      {toast ? (
        <div className="toast-pop fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-xl">
          <span>{toast.text}</span>
          <button type="button" onClick={resumeFromToast} className="shrink-0 cursor-pointer font-semibold text-sky underline underline-offset-2">
            Resume
          </button>
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="shrink-0 cursor-pointer text-white/60 hover:text-white">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      ) : null}
      {/* Conversation list */}
      <aside className={`flex flex-col border-r border-sky-line ${selectedId ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-sky-line p-3">
          <div className="flex gap-2">
            <input className="min-w-0 flex-1 rounded-xl border border-slate/20 px-3 py-2 text-sm outline-none focus:border-blue" placeholder="Search name or job" value={query} onChange={(e) => setQuery(e.target.value)} />
            <StatusFilter value={filter} onChange={(k) => setFilter(k as (typeof FILTERS)[number]["key"])} options={FILTERS} className="shrink-0" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="p-4 text-sm text-mist">No conversations.{" "}<Link href="/app/quotes/new" className="text-blue underline">Add a quote</Link>.</p>
          ) : (
            list.map((c) => (
              <Link key={c.id} href={`/inbox?p=${c.id}`} className={`block border-b border-sky-line px-4 py-3 hover:bg-sky/40 ${c.id === selectedId ? "bg-sky/60" : ""}`}>
                <div className="flex items-center gap-2">
                  {c.needsAttention ? <span className="h-2 w-2 shrink-0 rounded-full bg-blue" /> : null}
                  <span className="truncate font-semibold text-ink">{c.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-mist">{c.time ? timeLabel(c.time) : ""}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="truncate text-sm text-slate">{c.snippet || c.jobType || "No messages yet"}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-sky px-2 py-0.5 text-[10px] font-semibold text-blue">{STATUS_LABEL[c.status] ?? c.status}</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </aside>

      {/* Thread */}
      <section className={`flex flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!prospect ? (
          <div className="flex flex-1 items-center justify-center text-mist">Select a conversation</div>
        ) : (
          <>
            {/* detail + status controls */}
            <div className="border-b border-sky-line p-3">
              <div className="flex items-center gap-2">
                <Link href="/inbox" className="text-blue md:hidden">←</Link>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{prospect.name}</p>
                  <p className="truncate text-xs text-mist">
                    {prospect.jobType ?? "Quote"}{prospect.quoteAmount ? ` · ${formatMoney(prospect.quoteAmount)}` : ""}{prospect.phone ? ` · ${prospect.phone}` : ""}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-sky px-2.5 py-1 text-xs font-semibold text-blue">{STATUS_LABEL[shownStatus ?? ""] ?? shownStatus}</span>
              </div>
              <div className={`mt-2 flex flex-wrap gap-1.5 transition-opacity ${statusPending ? "opacity-50" : ""}`}>
                <button type="button" disabled={statusPending} onClick={() => changeStatus("won")} className="btn btn-sm border border-mint/40 text-mint hover:bg-mint/10">Mark won</button>
                <button type="button" disabled={statusPending} onClick={() => changeStatus("lost")} className="btn btn-sm border border-slate/20 text-slate hover:border-slate/40">Mark lost</button>
                {shownStatus === "paused" ? (
                  <button type="button" disabled={statusPending} onClick={() => changeStatus("sequencing")} className="btn btn-sm border border-blue/40 text-blue hover:bg-sky">Resume</button>
                ) : (
                  <button type="button" disabled={statusPending} onClick={() => changeStatus("paused")} className="btn btn-sm border border-slate/20 text-slate hover:border-slate/40">Pause</button>
                )}
                <button type="button" onClick={() => setShowReminder(true)} className="btn btn-sm border border-slate/20 text-slate hover:border-blue hover:text-blue">
                  Circle back later
                </button>
                <button type="button" onClick={() => setShowDetails((v) => !v)} className={`ml-auto cursor-pointer rounded-lg border px-3 py-1 text-xs font-semibold ${showDetails ? "border-blue bg-sky text-blue" : "border-slate/20 text-slate hover:border-slate/40"}`}>
                  {showDetails ? "Hide details" : "Details"}
                </button>
              </div>
              {showDetails ? <ProspectPanel key={prospect.id} prospect={prospect} onSaved={() => router.refresh()} onDelete={() => setShowDelete(true)} /> : null}
            </div>

            {/* messages */}
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto bg-white p-4">
              {thread.map((m, i) => {
                const day = dayLabel(m.createdAt);
                const sep = day !== lastDay ? ((lastDay = day), day) : null;
                const out = m.direction === "outbound";
                return (
                  <div key={i}>
                    {sep ? <div className="my-2 text-center text-xs text-mist">{sep}</div> : null}
                    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${out ? "rounded-br-sm bg-blue text-white" : "rounded-bl-sm bg-sky text-ink"}`}>
                        {m.body}
                        <span className={`ml-2 align-baseline text-[10px] ${out ? "text-white/70" : "text-mist"}`}>
                          {timeLabel(m.createdAt)}
                          {out ? (m.status === "failed" ? " ✗" : m.status === "queued" ? " …" : " ✓") : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {scheduled.map((s) => (
                <div key={`sch-${s.id}`} className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditStep(s)}
                    className="max-w-[80%] cursor-pointer rounded-2xl rounded-br-sm border border-dashed border-slate/30 bg-white px-3.5 py-2 text-left text-[13px] italic text-mist transition-colors hover:border-blue hover:text-blue"
                  >
                    {s.label} · {dayLabel(s.iso)} at {timeLabel(s.iso)}
                    <span className="ml-1 not-italic">›</span>
                  </button>
                </div>
              ))}
              {(shownStatus === "sequencing" || shownStatus === "paused") && prospect ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAddTouch(true)}
                    className="cursor-pointer rounded-full border border-dashed border-blue/40 px-3 py-1 text-xs font-semibold text-blue hover:bg-sky/40"
                  >
                    + Add a follow-up
                  </button>
                </div>
              ) : null}
              {reminders.map((r) => (
                <div key={`rem-${r.id}`} className="flex justify-end">
                  <div className="flex max-w-[80%] items-center gap-2 rounded-2xl rounded-br-sm border border-dashed border-amber/50 bg-white px-3.5 py-2 text-[13px] italic text-slate">
                    <span>
                      {r.mode === "auto_send" ? "Circle-back text sends" : "We will remind you"} {dayLabel(r.remindAt)} at {timeLabel(r.remindAt)}
                      {r.note ? ` (${r.note})` : ""}
                    </span>
                    <button
                      type="button"
                      aria-label="Cancel reminder"
                      className="cursor-pointer not-italic text-mist hover:text-red-700"
                      onClick={async () => { await cancelReminder(r.id); router.refresh(); }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              {thread.length === 0 && scheduled.length === 0 && reminders.length === 0 ? <p className="text-center text-sm text-mist">No messages yet.</p> : null}
            </div>

            {/* composer */}
            <div className="border-t border-sky-line p-3">
              {error ? <p className="mb-2 text-sm text-red-700">{error}</p> : null}
              {prospect.status === "opted_out" ? (
                <p className="text-center text-sm text-mist">This contact opted out. You cannot text them.</p>
              ) : (
                <div className="flex items-end gap-2">
                  <textarea
                    className="max-h-32 flex-1 resize-none rounded-xl border border-slate/20 px-3 py-2 text-base outline-none focus:border-blue"
                    rows={1}
                    placeholder="Type a message"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!pending && body.trim()) send(); } }}
                  />
                  <button type="button" disabled={pending || !body.trim()} onClick={send} className="btn btn-primary">
                    {pending ? "..." : "Send"}
                  </button>
                </div>
              )}
              <p className="mt-1.5 text-center text-[11px] text-mist">Sending here pauses the automatic follow-ups.</p>
            </div>
            {editStep ? (
              <TouchEditor
                key={editStep.id}
                prospect={prospect}
                bubble={editStep}
                onClose={() => setEditStep(null)}
                onSaved={() => { setEditStep(null); router.refresh(); }}
              />
            ) : null}
            {showAddTouch ? (
              <AddTouchModal
                prospect={prospect}
                onClose={() => setShowAddTouch(false)}
                onSaved={() => { setShowAddTouch(false); router.refresh(); }}
              />
            ) : null}
            {showReminder ? (
              <ReminderModal
                prospect={prospect}
                onClose={() => setShowReminder(false)}
                onSaved={() => { setShowReminder(false); router.refresh(); }}
              />
            ) : null}
            {showDelete ? (
              <DeleteProspectModal
                prospect={prospect}
                onClose={() => setShowDelete(false)}
                onDeleted={() => { setShowDelete(false); router.push("/inbox"); router.refresh(); }}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

const panelInput = "w-full rounded-lg border border-slate/20 px-3 py-2 text-sm outline-none focus:border-blue";

// Editable prospect details + notes. Notes feed the AI when drafting future
// follow-ups for this prospect.
function ProspectPanel({ prospect, onSaved, onDelete }: { prospect: ProspectDetail; onSaved: () => void; onDelete: () => void }) {
  const [f, setF] = useState({
    first_name: prospect.firstName,
    last_name: prospect.lastName,
    phone: prospect.phone ?? "",
    job_type: prospect.jobType ?? "",
    quote_amount: prospect.quoteAmount != null ? String(prospect.quoteAmount) : "",
    address: prospect.address ?? "",
    notes: prospect.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof f, v: string) => { setF((p) => ({ ...p, [k]: v })); setSaved(false); };

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await updateProspect(prospect.id, f);
    setSaving(false);
    if (!res.ok) return setErr(res.error);
    setSaved(true);
    onSaved();
  }

  return (
    <div className="mt-3 rounded-xl border border-sky-line bg-sky/20 p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">First name</span><input className={panelInput} value={f.first_name} onChange={(e) => set("first_name", e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Last name</span><input className={panelInput} value={f.last_name} onChange={(e) => set("last_name", e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Mobile</span><input className={panelInput} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Quote amount</span><input className={panelInput} inputMode="decimal" value={f.quote_amount} onChange={(e) => set("quote_amount", e.target.value)} /></label>
        <label className="col-span-2 flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Job</span><input className={panelInput} value={f.job_type} onChange={(e) => set("job_type", e.target.value)} placeholder="Roof replacement" /></label>
        <label className="col-span-2 flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Job location</span><input className={panelInput} value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" /></label>
        <label className="col-span-2 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-mist">Notes (used when we write their follow-ups)</span>
          <textarea className={panelInput} rows={3} value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Gate code 4412, prefers mornings, asked about financing..." />
        </label>
      </div>
      {err ? <p className="mt-2 text-xs text-red-700">{err}</p> : null}
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={saving} onClick={save} className="btn btn-primary btn-sm">
          {saving ? "Saving..." : "Save details"}
        </button>
        {saved ? <span className="text-xs text-mint">Saved</span> : null}
        <button type="button" onClick={onDelete} className="ml-auto cursor-pointer text-xs font-semibold text-red-700/70 hover:text-red-700 hover:underline">
          Delete this quote
        </button>
      </div>
    </div>
  );
}

// Delete confirmation, same confirm-with-1 pattern as the SMS relay ("text 1
// to send it"). Soft delete: the thread disappears from the app, the record
// stays on file.
function DeleteProspectModal({ prospect, onClose, onDeleted }: { prospect: ProspectDetail; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setErr(null);
    const res = await deleteProspect(prospect.id);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    onDeleted();
  }

  return (
    <>
      <button type="button" aria-label="Close" className="overlay-scrim fixed inset-0 z-40 cursor-default bg-ink/20" onClick={onClose} />
      <div className="overlay-panel fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sky-line bg-white p-6 shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)]">
        <h3 className="font-semibold text-ink">Delete {prospect.name}?</h3>
        <p className="mt-1 text-sm text-slate">
          This stops every follow-up and reminder and removes them from your dashboard and inbox. Their message history stays on file for compliance.
        </p>
        <label className="mt-4 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-mist">Type 1 to delete</span>
          <input
            className={panelInput}
            inputMode="numeric"
            autoFocus
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && confirm.trim() === "1" && !busy) run(); }}
            placeholder="1"
          />
        </label>
        {err ? <p className="mt-2 text-xs text-red-700">{err}</p> : null}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={busy || confirm.trim() !== "1"}
            onClick={run}
            className="btn btn-sm bg-red-700 text-white hover:bg-red-800 disabled:opacity-40"
          >
            {busy ? "Deleting..." : "Delete"}
          </button>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-slate hover:bg-sky">Keep it</button>
        </div>
      </div>
    </>
  );
}

// "Circle back later": set a reminder months out. Remind-me pings the
// contractor's cell with a one-tap relay; auto-send schedules a drafted text
// in their voice (windows/opt-out checked at send time, not now).
function ReminderModal({ prospect, onClose, onSaved }: { prospect: ProspectDetail; onClose: () => void; onSaved: () => void }) {
  const inThreeDays = new Date(Date.now() + 3 * 86400_000);
  const [date, setDate] = useState(inThreeDays.toISOString().slice(0, 10));
  const [time, setTime] = useState("10:00");
  const [mode, setMode] = useState<"remind_me" | "auto_send">("remind_me");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const when = new Date(`${date}T${time}`);
    const res = await createReminder(prospect.id, when.toISOString(), mode, note);
    setBusy(false);
    if (!res.ok) return setErr(res.error);
    onSaved();
  }

  return (
    <>
      <button type="button" aria-label="Close" className="overlay-scrim fixed inset-0 z-40 cursor-default bg-ink/20" onClick={onClose} />
      <div className="overlay-panel fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sky-line bg-white p-6 shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)]">
        <h3 className="font-semibold text-ink">Circle back with {prospect.firstName || "this lead"}</h3>
        <p className="mt-1 text-xs text-mist">Pick when. You can go months out ("not until spring" works).</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Date</span><input type="date" className={panelInput} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Time</span><input type="time" className={panelInput} value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${mode === "remind_me" ? "border-blue bg-sky/40" : "border-slate/20"}`}>
            <input type="radio" name="rem-mode" className="mt-0.5" checked={mode === "remind_me"} onChange={() => setMode("remind_me")} />
            <span className="text-sm"><span className="font-semibold text-ink">Text me a reminder</span><br /><span className="text-slate">We ping your cell and you reply to text them through ReKnock.</span></span>
          </label>
          <label className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${mode === "auto_send" ? "border-blue bg-sky/40" : "border-slate/20"}`}>
            <input type="radio" name="rem-mode" className="mt-0.5" checked={mode === "auto_send"} onChange={() => setMode("auto_send")} />
            <span className="text-sm"><span className="font-semibold text-ink">Send it for me</span><br /><span className="text-slate">We text them then, in your voice, referencing this quote. Only inside your sending hours.</span></span>
          </label>
        </div>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-mist">Anything we should mention? (optional)</span>
          <input className={panelInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder="They said call back after the holidays" maxLength={200} />
        </label>

        {err ? <p className="mt-2 text-xs text-red-700">{err}</p> : null}

        <div className="mt-4 flex items-center gap-2">
          <button type="button" disabled={busy} onClick={save} className="btn btn-primary btn-sm">
            {busy ? "Saving..." : "Set it"}
          </button>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-slate hover:bg-sky">Cancel</button>
        </div>
      </div>
    </>
  );
}


function toLocalInput(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

// One scheduled touch, fully yours: the message opens editable (your words
// fully override our draft), and the touch can be moved to any date/time or
// deleted. Out-of-window times get the nearest valid slot offered back.
function TouchEditor({ prospect, bubble, onClose, onSaved }: { prospect: ProspectDetail; bubble: ScheduledBubble; onClose: () => void; onSaved: () => void }) {
  const initial = toLocalInput(bubble.iso);
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [text, setText] = useState("");
  const [moveDate, setMoveDate] = useState(initial.date);
  const [moveTime, setMoveTime] = useState(initial.time);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let alive = true;
    draftTouchPreview(bubble.id).then((r) => {
      if (!alive) return;
      setDraft(r);
      if (r.ok) setText(r.text);
    });
    return () => { alive = false; };
  }, [bubble.id]);

  async function run(fn: () => Promise<TimeResult | { ok: boolean; error?: string }>) {
    setBusy(true);
    setErr(null);
    setSuggestion(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) {
      setErr(("error" in res && res.error) || "Something went wrong.");
      if ("suggestionIso" in res && res.suggestionIso) setSuggestion(res.suggestionIso);
      return;
    }
    onSaved();
  }

  const kind = draft?.ok ? draft.kind : null;
  const edited = draft?.ok && text.trim() !== draft.text.trim();
  const moved = moveDate !== initial.date || moveTime !== initial.time;

  return (
    <>
      <button type="button" aria-label="Close" className="overlay-scrim fixed inset-0 z-40 cursor-default bg-ink/20" onClick={onClose} />
      <div className="overlay-panel fixed left-1/2 top-1/2 z-50 max-h-[90dvh] w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-sky-line bg-white p-6 shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)]">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">{bubble.label}</h3>
          <span className="text-xs text-mist">{dayLabel(bubble.iso)} at {timeLabel(bubble.iso)}</span>
        </div>
        {kind === "custom" ? (
          <p className="mt-1 text-xs text-blue">Your message. It sends exactly as written.</p>
        ) : kind ? (
          <p className="mt-1 text-xs text-mist">Drafted in your voice. Edit anything; your words win.</p>
        ) : null}

        <div className="mt-3">
          {!draft ? (
            <div className="flex items-center gap-2 py-6 text-sm text-mist"><span className="h-2 w-2 animate-bounce rounded-full bg-blue" /> Drafting...</div>
          ) : !draft.ok ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{draft.error}</p>
          ) : (
            <textarea
              className="w-full rounded-xl border border-slate/20 px-3 py-2 text-[15px] outline-none focus:border-blue"
              rows={4}
              maxLength={320}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
        </div>
        {draft?.ok ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy || !text.trim() || (!edited && kind === "custom")}
              onClick={() => run(() => saveTouchMessage(bubble.id, text))}
              className="btn btn-primary btn-sm"
            >
              Save message
            </button>
            {kind === "custom" ? (
              <button type="button" disabled={busy} onClick={() => run(() => saveTouchMessage(bubble.id, ""))} className="btn btn-ghost btn-sm">
                Back to auto-draft
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-sky-line bg-sky/20 p-3">
          <p className="text-[11px] font-semibold text-mist">Send it on</p>
          <div className="mt-1.5 flex flex-wrap items-end gap-2">
            <input type="date" className={panelInput + " max-w-[10.5rem]"} value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
            <input type="time" className={panelInput + " max-w-[7rem]"} value={moveTime} onChange={(e) => setMoveTime(e.target.value)} />
            <button
              type="button"
              disabled={busy || !moved || !moveDate || !moveTime}
              onClick={() => run(() => rescheduleTouch(bubble.id, new Date(`${moveDate}T${moveTime}`).toISOString()))}
              className="btn btn-primary btn-sm"
            >
              Move it
            </button>
          </div>
        </div>

        {err ? <p className="mt-2 text-xs text-red-700">{err}</p> : null}
        {suggestion ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => rescheduleTouch(bubble.id, suggestion))}
            className="mt-2 btn btn-sm border border-blue/40 text-blue hover:bg-sky/40"
          >
            Use {dayLabel(suggestion)} at {timeLabel(suggestion)} instead
          </button>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          {confirmDelete ? (
            <button type="button" disabled={busy} onClick={() => run(() => deleteTouch(bubble.id))} className="cursor-pointer rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
              Yes, delete it
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn btn-sm border border-red-200 text-red-600 hover:bg-red-50">
              Delete this follow-up
            </button>
          )}
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-slate hover:bg-sky">Close</button>
        </div>
      </div>
    </>
  );
}

// Add an extra touch anywhere on the timeline: any date/time, optional custom
// text (otherwise we draft it in their voice when it sends).
function AddTouchModal({ prospect, onClose, onSaved }: { prospect: ProspectDetail; onClose: () => void; onSaved: () => void }) {
  const inTwoDays = toLocalInput(new Date(Date.now() + 2 * 86400_000).toISOString());
  const [date, setDate] = useState(inTwoDays.date);
  const [time, setTime] = useState("10:00");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  async function save(iso?: string) {
    setBusy(true);
    setErr(null);
    setSuggestion(null);
    const when = iso ?? new Date(`${date}T${time}`).toISOString();
    const res = await addTouch(prospect.id, when, text);
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      if (res.suggestionIso) setSuggestion(res.suggestionIso);
      return;
    }
    onSaved();
  }

  return (
    <>
      <button type="button" aria-label="Close" className="overlay-scrim fixed inset-0 z-40 cursor-default bg-ink/20" onClick={onClose} />
      <div className="overlay-panel fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sky-line bg-white p-6 shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)]">
        <h3 className="font-semibold text-ink">Add a follow-up for {prospect.firstName || "this lead"}</h3>
        <p className="mt-1 text-xs text-mist">Pick any date and time inside your sending hours.</p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Date</span><input type="date" className={panelInput} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="flex flex-col gap-1"><span className="text-[11px] font-semibold text-mist">Time</span><input type="time" className={panelInput} value={time} onChange={(e) => setTime(e.target.value)} /></label>
        </div>

        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-mist">Message (optional; we draft it in your voice if you leave it blank)</span>
          <textarea className={panelInput} rows={3} maxLength={320} value={text} onChange={(e) => setText(e.target.value)} placeholder="Or write exactly what to send" />
        </label>

        {err ? <p className="mt-2 text-xs text-red-700">{err}</p> : null}
        {suggestion ? (
          <button type="button" disabled={busy} onClick={() => save(suggestion)} className="mt-2 btn btn-sm border border-blue/40 text-blue hover:bg-sky/40">
            Use {dayLabel(suggestion)} at {timeLabel(suggestion)} instead
          </button>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <button type="button" disabled={busy || !date || !time} onClick={() => save()} className="btn btn-primary btn-sm">
            {busy ? "Adding..." : "Add it"}
          </button>
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-slate hover:bg-sky">Cancel</button>
        </div>
      </div>
    </>
  );
}
