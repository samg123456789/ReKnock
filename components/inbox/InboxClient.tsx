"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendManualMessage, setProspectStatus, updateProspect, getScheduledDraft, setStepOverride, type DraftResult } from "@/lib/inbox-actions";

export type Conversation = { id: string; name: string; jobType: string; status: string; snippet: string; time: string; needsAttention: boolean };
export type ThreadMessage = { body: string; direction: "inbound" | "outbound"; status: string; createdAt: string };
export type ScheduledBubble = { step: number; index: number; date: string; enabled?: boolean };
export type ProspectDetail = {
  id: string; name: string; firstName: string; lastName: string; jobType: string | null; status: string;
  phone: string | null; email: string | null; address: string | null;
  quoteAmount: number | null; quoteDate: string | null; source: string | null; notes: string | null;
};

const STATUS_LABEL: Record<string, string> = { new: "New", sequencing: "Chasing", replied: "Replied", won: "Won", lost: "Lost", opted_out: "Opted out", paused: "Paused" };
const FILTERS = [
  { key: "all", label: "All" },
  { key: "replied", label: "Replied" },
  { key: "sequencing", label: "Chasing" },
  { key: "attention", label: "Needs review" },
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
  prospect,
}: {
  conversations: Conversation[];
  selectedId: string | null;
  thread: ThreadMessage[];
  scheduled: ScheduledBubble[];
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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.jobType.toLowerCase().includes(q)) return false;
      if (filter === "replied") return c.status === "replied";
      if (filter === "sequencing") return c.status === "sequencing";
      if (filter === "attention") return c.needsAttention;
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
    router.refresh();
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
      {/* Conversation list */}
      <aside className={`flex flex-col border-r border-sky-line ${selectedId ? "hidden md:flex" : "flex"}`}>
        <div className="border-b border-sky-line p-3">
          <input className="w-full rounded-xl border border-slate/20 px-3 py-2 text-sm outline-none focus:border-blue" placeholder="Search name or job" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="mt-2 flex gap-1.5">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${filter === f.key ? "bg-blue text-white" : "bg-sky text-blue"}`}>
                {f.label}
              </button>
            ))}
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
                    {prospect.jobType ?? "Quote"}{prospect.quoteAmount ? ` · $${prospect.quoteAmount}` : ""}{prospect.phone ? ` · ${prospect.phone}` : ""}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-sky px-2.5 py-1 text-xs font-semibold text-blue">{STATUS_LABEL[shownStatus ?? ""] ?? shownStatus}</span>
              </div>
              <div className={`mt-2 flex flex-wrap gap-1.5 transition-opacity ${statusPending ? "opacity-50" : ""}`}>
                <button type="button" disabled={statusPending} onClick={() => changeStatus("won")} className="cursor-pointer rounded-lg border border-mint/40 px-3 py-1 text-xs font-semibold text-mint hover:bg-mint/10 disabled:cursor-not-allowed">Mark won</button>
                <button type="button" disabled={statusPending} onClick={() => changeStatus("lost")} className="cursor-pointer rounded-lg border border-slate/20 px-3 py-1 text-xs font-semibold text-slate hover:border-slate/40 disabled:cursor-not-allowed">Mark lost</button>
                {shownStatus === "paused" ? (
                  <button type="button" disabled={statusPending} onClick={() => changeStatus("sequencing")} className="cursor-pointer rounded-lg border border-blue/40 px-3 py-1 text-xs font-semibold text-blue hover:bg-sky disabled:cursor-not-allowed">Resume</button>
                ) : (
                  <button type="button" disabled={statusPending} onClick={() => changeStatus("paused")} className="cursor-pointer rounded-lg border border-slate/20 px-3 py-1 text-xs font-semibold text-slate hover:border-slate/40 disabled:cursor-not-allowed">Pause</button>
                )}
                <button type="button" onClick={() => setShowDetails((v) => !v)} className={`ml-auto cursor-pointer rounded-lg border px-3 py-1 text-xs font-semibold ${showDetails ? "border-blue bg-sky text-blue" : "border-slate/20 text-slate hover:border-slate/40"}`}>
                  {showDetails ? "Hide details" : "Details"}
                </button>
              </div>
              {showDetails ? <ProspectPanel key={prospect.id} prospect={prospect} onSaved={() => router.refresh()} /> : null}
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
                      <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${out ? "rounded-br-sm bg-blue text-white" : "rounded-bl-sm bg-sky text-ink"}`}>
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
                <div key={`sch-${s.index}`} className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditStep(s)}
                    className="max-w-[80%] cursor-pointer rounded-2xl rounded-br-sm border border-dashed border-slate/30 bg-white px-3.5 py-2 text-left text-[13px] italic text-mist transition-colors hover:border-blue hover:text-blue"
                  >
                    Follow-up {s.step} scheduled for {prettyDate(s.date)}
                    <span className="ml-1 not-italic">›</span>
                  </button>
                </div>
              ))}
              {thread.length === 0 && scheduled.length === 0 ? <p className="text-center text-sm text-mist">No messages yet.</p> : null}
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
                  <button type="button" disabled={pending || !body.trim()} onClick={send} className="cursor-pointer rounded-xl bg-blue px-5 py-2.5 font-semibold text-white hover:bg-blue-deep disabled:opacity-50">
                    {pending ? "..." : "Send"}
                  </button>
                </div>
              )}
              <p className="mt-1.5 text-center text-[11px] text-mist">Sending here pauses the automatic follow-ups.</p>
            </div>
            {editStep ? (
              <ScheduledEditor
                key={`${prospect.id}-${editStep.index}`}
                prospect={prospect}
                bubble={editStep}
                onClose={() => setEditStep(null)}
                onSaved={() => { setEditStep(null); router.refresh(); }}
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
function ProspectPanel({ prospect, onSaved }: { prospect: ProspectDetail; onSaved: () => void }) {
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
        <button type="button" disabled={saving} onClick={save} className="cursor-pointer rounded-lg bg-blue px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-deep disabled:opacity-50">
          {saving ? "Saving..." : "Save details"}
        </button>
        {saved ? <span className="text-xs text-mint">Saved</span> : null}
      </div>
    </div>
  );
}

// Opens the actual message an upcoming step will send, with edit / skip / reset.
function ScheduledEditor({ prospect, bubble, onClose, onSaved }: { prospect: ProspectDetail; bubble: ScheduledBubble; onClose: () => void; onSaved: () => void }) {
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setDraft(null);
    const r = await getScheduledDraft(prospect.id, bubble.index);
    setDraft(r);
    if (r.ok) setText(r.text);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setErr(null);
    const res = await fn();
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Something went wrong.");
    onSaved();
  }

  const kind = draft?.ok ? draft.kind : null;

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 cursor-default bg-ink/20" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-sky-line bg-white p-5 shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)]">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ink">Follow-up {bubble.step}</h3>
          <span className="text-xs text-mist">{prettyDate(bubble.date)}</span>
        </div>
        {kind === "custom" ? <p className="mt-1 text-xs text-blue">Your edited message</p> : kind === "skip" ? <p className="mt-1 text-xs text-amber">This step is set to skip</p> : kind === "template" ? <p className="mt-1 text-xs text-mist">From your saved template</p> : kind === "ai" ? <p className="mt-1 text-xs text-mist">Drafted in your voice</p> : null}

        <div className="mt-3">
          {!draft ? (
            <div className="flex items-center gap-2 py-6 text-sm text-mist"><span className="h-2 w-2 animate-bounce rounded-full bg-blue" /> Drafting...</div>
          ) : !draft.ok ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{draft.error}</p>
          ) : draft.kind === "skip" ? (
            <p className="rounded-lg bg-amber/10 px-3 py-3 text-sm text-slate">We will skip this follow-up and move to the next one.</p>
          ) : editing ? (
            <textarea className="w-full rounded-xl border border-slate/20 px-3 py-2 text-[15px] outline-none focus:border-blue" rows={4} maxLength={320} value={text} onChange={(e) => setText(e.target.value)} />
          ) : (
            <div className="rounded-2xl rounded-bl-sm bg-sky px-4 py-3 text-[15px] leading-snug text-ink">{text}</div>
          )}
        </div>

        {err ? <p className="mt-2 text-xs text-red-700">{err}</p> : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {draft?.ok && draft.kind !== "skip" && !editing ? (
            <button type="button" onClick={() => setEditing(true)} className="cursor-pointer rounded-lg border border-slate/20 px-3 py-1.5 text-xs font-semibold text-slate hover:border-blue hover:text-blue">Edit</button>
          ) : null}
          {editing ? (
            <button type="button" disabled={busy || !text.trim()} onClick={() => act(() => setStepOverride(prospect.id, bubble.index, "custom", text))} className="cursor-pointer rounded-lg bg-blue px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-deep disabled:opacity-50">Save message</button>
          ) : null}
          {draft?.ok && draft.kind !== "skip" ? (
            <button type="button" disabled={busy} onClick={() => act(() => setStepOverride(prospect.id, bubble.index, "skip"))} className="cursor-pointer rounded-lg border border-amber/40 px-3 py-1.5 text-xs font-semibold text-amber hover:bg-amber/10 disabled:opacity-50">Skip this step</button>
          ) : null}
          {kind === "custom" || kind === "skip" ? (
            <button type="button" disabled={busy} onClick={() => act(() => setStepOverride(prospect.id, bubble.index, "clear"))} className="cursor-pointer rounded-lg border border-slate/20 px-3 py-1.5 text-xs font-semibold text-slate hover:border-slate/40 disabled:opacity-50">Reset to auto</button>
          ) : null}
          <button type="button" onClick={onClose} className="ml-auto cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold text-slate hover:bg-sky">Close</button>
        </div>
      </div>
    </>
  );
}
