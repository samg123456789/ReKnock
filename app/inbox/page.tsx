import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import InboxClient, { type Conversation, type ThreadMessage, type ScheduledBubble, type ReminderItem, type ProspectDetail, type PendingSend } from "@/components/inbox/InboxClient";

export const metadata: Metadata = { title: "Inbox - ReKnock" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  const cid = acting.companyId;
  const sb = acting.client;
  const { p: selectedId } = await searchParams;

  if (!cid) return <InboxClient conversations={[]} selectedId={null} thread={[]} scheduled={[]} reminders={[]} prospect={null} pending={[]} />;

  // Independent queries run in parallel (was 2 serial round-trips).
  const [{ data: prospects }, { data: allMessages }] = await Promise.all([
    sb
      .from("prospects")
      .select("id, first_name, last_name, job_type, status, phone_e164, email, address, quote_amount, quote_date, source, campaign_id, notes, created_at")
      .eq("company_id", cid)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    sb
      .from("messages")
      .select("id, prospect_id, body, direction, status, kind, sequence_step, scheduled_for, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

  // The homeowner-facing thread: hide future/canceled rows (they render as
  // scheduled bubbles instead) and pings sent to the contractor's own cell.
  const messages = (allMessages ?? []).filter(
    (m) => m.status !== "scheduled" && m.status !== "canceled" && m.kind !== "owner_ping",
  );

  // Latest message + inbound-last flag per prospect.
  const latest = new Map<string, { body: string; created_at: string; direction: string }>();
  for (const m of messages ?? []) {
    if (!m.prospect_id) continue;
    latest.set(m.prospect_id, { body: m.body ?? "", created_at: m.created_at, direction: m.direction });
  }

  const conversations: Conversation[] = (prospects ?? [])
    .map((p) => {
      const l = latest.get(p.id);
      return {
        id: p.id,
        name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown",
        jobType: p.job_type ?? "",
        status: p.status,
        snippet: l?.body ?? "",
        time: l?.created_at ?? p.created_at,
        needsAttention: l?.direction === "inbound",
      };
    })
    .sort((a, b) => (a.time < b.time ? 1 : -1));

  const selected = (prospects ?? []).find((p) => p.id === selectedId) ?? null;

  let thread: ThreadMessage[] = [];
  let scheduled: ScheduledBubble[] = [];
  let reminders: ReminderItem[] = [];
  let pending: PendingSend[] = [];
  let prospect: ProspectDetail | null = null;

  if (selected) {
    thread = (messages ?? [])
      .filter((m) => m.prospect_id === selected.id)
      .map((m) => ({ body: m.body ?? "", direction: m.direction as "inbound" | "outbound", status: m.status ?? "", createdAt: m.created_at }));

    prospect = {
      id: selected.id,
      name: `${selected.first_name ?? ""} ${selected.last_name ?? ""}`.trim() || "Unknown",
      firstName: selected.first_name ?? "",
      lastName: selected.last_name ?? "",
      jobType: selected.job_type,
      status: selected.status,
      phone: selected.phone_e164,
      email: selected.email,
      address: selected.address,
      quoteAmount: selected.quote_amount,
      quoteDate: selected.quote_date,
      source: selected.source,
      notes: selected.notes ?? null,
    };

    // Upcoming touches come straight from the scheduled `messages` rows (the
    // engine's source of truth), so Pause/Resume/freeze always match reality.
    if (selected.status === "sequencing" || selected.status === "paused") {
      scheduled = (allMessages ?? [])
        .filter((m) => m.prospect_id === selected.id && m.status === "scheduled" && m.kind === "sequence")
        .sort((a, b) => ((a.scheduled_for ?? "") < (b.scheduled_for ?? "") ? -1 : 1))
        .map((m) => ({
          id: m.id as string,
          label: m.sequence_step != null ? `Follow-up ${(m.sequence_step as number) + 1}` : "Extra follow-up",
          iso: m.scheduled_for ?? m.created_at,
        }));
    }

    // Composer messages still inside their grace window: real bubbles with a
    // live Cancel until the dispatcher claims them.
    pending = (allMessages ?? [])
      .filter((m) => m.prospect_id === selected.id && m.status === "scheduled" && m.kind === "manual")
      .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
      .map((m) => ({ id: m.id as string, body: m.body ?? "", iso: m.scheduled_for ?? m.created_at }));

    const { data: rems } = await sb
      .from("reminders")
      .select("id, remind_at, mode, note")
      .eq("prospect_id", selected.id)
      .eq("status", "pending")
      .order("remind_at", { ascending: true });
    reminders = (rems ?? []).map((r) => ({ id: r.id, remindAt: r.remind_at, mode: r.mode as "remind_me" | "auto_send", note: r.note }));
  }

  return <InboxClient conversations={conversations} selectedId={selectedId ?? null} thread={thread} scheduled={scheduled} reminders={reminders} prospect={prospect} pending={pending} />;
}
