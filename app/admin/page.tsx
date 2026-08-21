import { requireAdmin } from "@/lib/admin";
import AdminCustomersTable, { type CustomerRow } from "@/components/admin/AdminCustomersTable";
import { tradeLabel } from "@/lib/trades";
import Link from "next/link";

export const metadata = { title: "Admin - ReKnock" };

export default async function AdminHome() {
  const { admin } = await requireAdmin();

  const [{ data: companies }, { data: prospects }, { data: msgs }] = await Promise.all([
    admin
      .from("companies")
      .select("id, name, trade, plan, subscription_status, trial_messages_used, created_at, onboarded_at, users(email, full_name)")
      .order("created_at", { ascending: false }),
    admin.from("prospects").select("company_id, created_at"),
    admin.from("messages").select("company_id, direction, status, created_at"),
  ]);

  const prospectCount = new Map<string, number>();
  const lastActivity = new Map<string, string>();
  for (const p of prospects ?? []) {
    prospectCount.set(p.company_id, (prospectCount.get(p.company_id) ?? 0) + 1);
    if (!lastActivity.get(p.company_id) || p.created_at > lastActivity.get(p.company_id)!)
      lastActivity.set(p.company_id, p.created_at);
  }
  const sentCount = new Map<string, number>();
  for (const m of msgs ?? []) {
    if (m.direction === "outbound" && (m.status === "sent" || m.status === "delivered"))
      sentCount.set(m.company_id, (sentCount.get(m.company_id) ?? 0) + 1);
    if (!lastActivity.get(m.company_id) || m.created_at > lastActivity.get(m.company_id)!)
      lastActivity.set(m.company_id, m.created_at);
  }

  const rows: CustomerRow[] = (companies ?? []).map((c) => {
    const owner = Array.isArray(c.users) ? c.users[0] : c.users;
    return {
      id: c.id,
      company: c.name ?? "(no name)",
      email: (owner as { email?: string } | null)?.email ?? "",
      trade: c.trade ? tradeLabel(c.trade) : "",
      plan: c.plan ?? "",
      subStatus: c.subscription_status ?? "none",
      trialUsed: c.trial_messages_used ?? 0,
      onboarded: Boolean(c.onboarded_at),
      prospects: prospectCount.get(c.id) ?? 0,
      sent: sentCount.get(c.id) ?? 0,
      lastActivity: lastActivity.get(c.id) ?? c.created_at,
      createdAt: c.created_at,
    };
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="display text-2xl">Customers ({rows.length})</h1>
        <Link href="/admin/company-os" className="btn btn-ghost btn-sm">
          Company OS
        </Link>
      </div>
      <AdminCustomersTable rows={rows} />
    </div>
  );
}
