"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendManualMessage, setProspectStatus } from "@/lib/inbox-actions";

export type Conversation = { id: string; name: string; jobType: string; status: string; snippet: string; time: string; needsAttention: boolean };
export type ThreadMessage = { body: string; direction: "inbound" | "outbound"; status: string; createdAt: string };
export type ScheduledBubble = { step: number; date: string };
export type ProspectDetail = {
  id: string; name: string; jobType: string | null; status: string;
  phone: string | null; email: string | null; address: string | null;
  quoteAmount: number | null; quoteDate: string | null; source: string | null;
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
              </div>
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
                <div key={`sch-${s.step}`} className="flex justify-end">
                  <div className="max-w-[80%] rounded-2xl rounded-br-sm border border-dashed border-slate/30 bg-white px-3.5 py-2 text-[13px] italic text-mist">
                    Follow-up {s.step} scheduled for {prettyDate(s.date)}
                  </div>
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
          </>
        )}
      </section>
    </div>
  );
}
