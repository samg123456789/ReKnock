"use server";

import { getActingCompany } from "@/lib/acting-company";

export type Notification = {
  id: string;
  kind: "reply" | "cap" | "opt_out" | "usage";
  text: string;
  href: string | null;
  at: string; // ISO timestamp
};

// Recent notification-worthy events for the acting company, mapped to friendly
// lines with a link. Sourced entirely from the append-only `events` ledger.
export async function getNotifications(): Promise<Notification[]> {
  const acting = await getActingCompany();
  if (!acting?.companyId) return [];
  const sb = acting.client;

  const { data: events } = await sb
    .from("events")
    .select("id, type, payload, created_at")
    .eq("company_id", acting.companyId)
    .in("type", ["reply_received", "cap_reached", "opt_out", "quote_limit_warning", "quote_limit_reached"])
    .order("created_at", { ascending: false })
    .limit(20);
  if (!events?.length) return [];

  // Resolve names for events that carry a prospect_id.
  const pids = [
    ...new Set(
      events
        .map((e) => (e.payload as { prospect_id?: string } | null)?.prospect_id)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const names = new Map<string, string>();
  if (pids.length) {
    const { data: ps } = await sb.from("prospects").select("id, first_name, last_name").in("id", pids);
    for (const p of ps ?? []) {
      names.set(p.id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "A customer");
    }
  }

  return events.map((e) => {
    const pid = (e.payload as { prospect_id?: string } | null)?.prospect_id;
    const who = pid ? names.get(pid) ?? "A customer" : "A customer";
    if (e.type === "reply_received")
      return { id: e.id, kind: "reply" as const, text: `${who} replied to your follow-up`, href: pid ? `/inbox?p=${pid}` : "/inbox", at: e.created_at };
    if (e.type === "cap_reached")
      return { id: e.id, kind: "cap" as const, text: `Trial limit hit while chasing ${who}. Upgrade to keep going.`, href: "/settings", at: e.created_at };
    if (e.type === "quote_limit_reached")
      return { id: e.id, kind: "usage" as const, text: "Monthly quote limit reached. Existing follow-ups are still running.", href: "/settings", at: e.created_at };
    if (e.type === "quote_limit_warning") {
      const payload = (e.payload as { threshold?: number; used?: number } | null) ?? {};
      const remaining = Math.max(0, 100 - (payload.used ?? 0));
      return { id: e.id, kind: "usage" as const, text: `${payload.threshold ?? 0}% of your monthly quote allowance used. ${remaining} quotes remain.`, href: "/settings", at: e.created_at };
    }
    return { id: e.id, kind: "opt_out" as const, text: `${who} opted out of texts. Their follow-ups are stopped.`, href: pid ? `/inbox?p=${pid}` : "/inbox", at: e.created_at };
  });
}
