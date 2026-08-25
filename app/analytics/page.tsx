import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Analytics - ReKnock" };

type Prospect = { status: string; quote_amount: number | null; created_at: string };
type Message = { direction: string; status: string | null; created_at: string; prospect_id: string | null };

export default async function AnalyticsPage() {
  const acting = await getActingCompany();
  if (!acting?.companyId) redirect("/login");

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: prospects }, { data: messages }] = await Promise.all([
    acting.client.from("prospects").select("status, quote_amount, created_at").eq("company_id", acting.companyId).is("deleted_at", null),
    acting.client.from("messages").select("direction, status, created_at, prospect_id").eq("company_id", acting.companyId).gte("created_at", since),
  ]);

  const ps = (prospects ?? []) as Prospect[];
  const ms = (messages ?? []) as Message[];
  const quotes = ps.length;
  const replied = ps.filter((p) => p.status === "replied" || p.status === "won" || p.status === "lost").length;
  const won = ps.filter((p) => p.status === "won");
  const active = ps.filter((p) => p.status === "sequencing" || p.status === "paused");
  const outbound = ms.filter((m) => m.direction === "outbound");
  const inbound = ms.filter((m) => m.direction === "inbound");
  const delivered = outbound.filter((m) => m.status === "delivered" || m.status === "sent").length;
  const failed = outbound.filter((m) => m.status === "failed").length;
  const replyRate = quotes ? Math.round((replied / quotes) * 100) : 0;
  const pipeline = active.reduce((sum, p) => sum + (Number(p.quote_amount) || 0), 0);
  const wonValue = won.reduce((sum, p) => sum + (Number(p.quote_amount) || 0), 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - i));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: date.toLocaleDateString("en-US", { weekday: "short" }),
      outbound: outbound.filter((m) => m.created_at.slice(0, 10) === key).length,
      inbound: inbound.filter((m) => m.created_at.slice(0, 10) === key).length,
    };
  });
  const maxActivity = Math.max(1, ...days.map((d) => d.outbound + d.inbound));

  return (
    <main className="app-bg">
      <div className="app-shell max-w-5xl">
        <span className="ai-chip">Last 30 days</span>
        <h1 className="display mt-4 text-3xl md:text-4xl">Is the follow-up working?</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate">
          A simple view of quote activity, conversations, and delivery health. ReKnock gets smarter as you work more quotes.
        </p>

        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Quotes" value={String(quotes)} detail={`${active.length} still active`} />
          <Metric label="Reply rate" value={`${replyRate}%`} detail={`${replied} quote${replied === 1 ? "" : "s"} got a reply`} />
          <Metric label="Won value" value={formatMoney(wonValue) || "$0"} detail={`${won.length} won`} />
          <Metric label="Active pipeline" value={formatMoney(pipeline) || "$0"} detail={`${active.length} being chased`} />
        </div>

        <section className="app-panel mt-5 p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="surface-label">Conversation activity</p>
              <h2 className="display mt-1 text-2xl">The last 7 days</h2>
            </div>
            <p className="text-sm text-slate">{outbound.length} sent · {inbound.length} received</p>
          </div>
          <div className="mt-6 flex h-44 items-end gap-2 sm:gap-4">
            {days.map((day) => {
              const total = day.outbound + day.inbound;
              const height = total ? Math.max(8, Math.round((total / maxActivity) * 100)) : 3;
              return (
                <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <span className="text-xs font-semibold text-slate">{total || ""}</span>
                  <div className="flex h-32 w-full items-end justify-center rounded-lg bg-sky/45 px-1">
                    <div className="w-full max-w-10 rounded-t-md bg-blue" style={{ height: `${height}%` }} title={`${day.outbound} sent, ${day.inbound} received`} />
                  </div>
                  <span className="text-xs text-mist">{day.label}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate">
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue" /> Messages sent and received</span>
            <span>Hover a bar for the daily split.</span>
          </div>
        </section>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <section className="app-panel p-6">
            <p className="surface-label">Delivery health</p>
            <h2 className="display mt-1 text-2xl">Are messages landing?</h2>
            <div className="mt-5 space-y-3 text-sm">
              <Row label="Sent or delivered" value={String(delivered)} tone="good" />
              <Row label="Failed delivery" value={String(failed)} tone={failed ? "warn" : "good"} />
              <Row label="Received replies" value={String(inbound.length)} tone="neutral" />
            </div>
            <p className="mt-5 text-xs leading-relaxed text-mist">Delivery numbers are based on the message ledger. A failed count is a reason to check the Inbox and contact support—not to resend blindly.</p>
          </section>
          <section className="app-panel p-6">
            <p className="surface-label">What to do next</p>
            <h2 className="display mt-1 text-2xl">Keep the loop moving</h2>
            <div className="mt-5 space-y-3 text-sm text-slate">
              <p><strong className="text-ink">More replies:</strong> add every new quote quickly and let the sequence handle the quiet days.</p>
              <p><strong className="text-ink">More wins:</strong> open replied conversations in the Inbox and take over while interest is warm.</p>
              <p><strong className="text-ink">Low activity:</strong> forward or BCC quotes to your ReKnock intake address from the Dashboard.</p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="stat-card"><p className="surface-label">{label}</p><p className="mt-2 text-3xl font-bold leading-none text-ink">{value}</p><p className="mt-2 text-xs text-slate">{detail}</p></div>;
}

function Row({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "neutral" }) {
  const color = tone === "good" ? "text-mint" : tone === "warn" ? "text-amber" : "text-blue";
  return <div className="flex items-center justify-between border-b border-sky-line/70 pb-3 last:border-0 last:pb-0"><span>{label}</span><span className={`text-lg font-bold ${color}`}>{value}</span></div>;
}
