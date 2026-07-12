import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import InboxClient, { type Conversation, type ThreadMessage, type ScheduledBubble, type ProspectDetail } from "@/components/inbox/InboxClient";
import { DEFAULT_CAMPAIGN_STEPS, type CampaignStep } from "@/lib/campaign";

export const metadata: Metadata = { title: "Inbox - ReKnock" };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  const cid = acting.companyId;
  const sb = acting.client;
  const { p: selectedId } = await searchParams;

  if (!cid) return <InboxClient conversations={[]} selectedId={null} thread={[]} scheduled={[]} prospect={null} />;

  // Independent queries run in parallel (was 2 serial round-trips).
  const [{ data: prospects }, { data: messages }] = await Promise.all([
    sb
      .from("prospects")
      .select("id, first_name, last_name, job_type, status, phone_e164, email, address, quote_amount, quote_date, source, campaign_id, notes, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: false }),
    sb
      .from("messages")
      .select("prospect_id, body, direction, status, sequence_step, created_at")
      .eq("company_id", cid)
      .order("created_at", { ascending: true })
      .limit(2000),
  ]);

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

    if (selected.status === "sequencing") {
      const sentSteps = new Set(
        (messages ?? [])
          .filter((m) => m.prospect_id === selected.id && m.direction === "outbound" && m.sequence_step != null)
          .map((m) => m.sequence_step as number),
      );
      let steps: CampaignStep[] = DEFAULT_CAMPAIGN_STEPS;
      if (selected.campaign_id) {
        const { data: c } = await sb.from("campaigns").select("steps").eq("id", selected.campaign_id).maybeSingle();
        const cs = c?.steps as CampaignStep[] | null;
        if (Array.isArray(cs) && cs.length) steps = cs;
      }
      const base = selected.quote_date ? new Date(`${selected.quote_date}T12:00:00Z`) : new Date(selected.created_at);
      scheduled = steps
        .map((s, i) => {
          const d = new Date(base);
          d.setDate(d.getDate() + (s.day_offset ?? 0));
          return { step: i + 1, index: i, date: d.toISOString().slice(0, 10), enabled: s.enabled !== false };
        })
        .filter((b) => !sentSteps.has(b.index) && b.enabled);
    }
  }

  return <InboxClient conversations={conversations} selectedId={selectedId ?? null} thread={thread} scheduled={scheduled} prospect={prospect} />;
}
