import Link from "next/link";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Operations - ReKnock" };
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const { admin } = await requireAdmin();
  const [{ data: failedJobs }, { data: inbound }, { data: numbers }, { data: events }] = await Promise.all([
    admin.from("failed_jobs").select("id, company_id, job_type, error, created_at, payload").order("created_at", { ascending: false }).limit(50),
    admin.from("inbound_emails").select("id, company_id, from_addr, subject, resolution, created_at").order("created_at", { ascending: false }).limit(100),
    admin.from("phone_numbers").select("id, company_id, e164, status, tendlc_status, updated_at").neq("status", "active").neq("status", "released").order("updated_at", { ascending: false }).limit(50),
    admin.from("events").select("id, company_id, type, payload, created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const unresolved = (inbound ?? []).filter((row) => row.resolution === "unmatched" || row.resolution === "needs_review" || !row.resolution);
  const webhookFailures = (events ?? []).filter((row) => /webhook|delivery_failed|unrouted|missed|filtered/i.test(row.type));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-blue">Admin</Link>
          <h1 className="display mt-2 text-3xl">Operations</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">The day-one queue for anything that can interrupt a customer’s first follow-up.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <Metric label="Failed jobs" value={String(failedJobs?.length ?? 0)} />
          <Metric label="Email review" value={String(unresolved.length)} />
          <Metric label="Numbers" value={String(numbers?.length ?? 0)} />
          <Metric label="Webhook signals" value={String(webhookFailures.length)} />
        </div>
      </div>

      <OpsSection title="Failed jobs" hint="AI, delivery, intake, and background work that needs inspection.">
        {failedJobs?.length ? <div className="divide-y divide-sky-line/70">{failedJobs.map((job) => <Item key={job.id} title={job.job_type} meta={formatDate(job.created_at)} detail={job.error ?? "No error recorded."} />)}</div> : <Empty text="No failed jobs in the latest 50 records." />}
      </OpsSection>

      <OpsSection title="Inbound email review" hint="Unmatched quote emails and messages that the intake agent could not safely resolve.">
        {unresolved.length ? <div className="divide-y divide-sky-line/70">{unresolved.map((mail) => <Item key={mail.id} title={mail.subject || "No subject"} meta={`${mail.from_addr || "unknown sender"} · ${mail.resolution || "unresolved"}`} detail="Open the sender/company record, resolve the match, then reprocess or contact the customer." />)}</div> : <Empty text="No unmatched or needs-review inbound emails." />}
      </OpsSection>

      <OpsSection title="Number provisioning" hint="Numbers waiting on carrier activation or marked failed.">
        {numbers?.length ? <div className="divide-y divide-sky-line/70">{numbers.map((number) => <Item key={number.id} title={number.e164 || "Number not assigned"} meta={`${number.status} · ${formatDate(number.updated_at)}`} detail={statusDetail(number.tendlc_status)} />)}</div> : <Empty text="No number provisioning issues." />}
      </OpsSection>

      <OpsSection title="Webhook and delivery signals" hint="Recent events worth checking when a customer says something did not arrive.">
        {webhookFailures.length ? <div className="divide-y divide-sky-line/70">{webhookFailures.slice(0, 50).map((event) => <Item key={event.id} title={event.type} meta={formatDate(event.created_at)} detail={payloadDetail(event.payload)} />)}</div> : <Empty text="No recent webhook or delivery warning events." />}
      </OpsSection>
    </div>
  );
}

function OpsSection({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <section><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="display text-xl">{title}</h2><p className="mt-1 text-sm text-mist">{hint}</p></div></div><div className="surface-card mt-3 p-0">{children}</div></section>;
}

function Item({ title, meta, detail }: { title: string; meta: string; detail: string }) {
  return <div className="px-5 py-4"><div className="flex flex-wrap items-start justify-between gap-2"><p className="font-semibold text-ink">{title}</p><span className="text-xs text-mist">{meta}</span></div><p className="mt-1 text-sm leading-relaxed text-slate">{detail}</p></div>;
}

function Empty({ text }: { text: string }) { return <p className="px-5 py-7 text-sm text-mist">{text}</p>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="stat-card min-w-24 min-h-0 px-3 py-3"><div className="text-xs text-mist">{label}</div><div className="mt-1 text-sm font-bold text-ink">{value}</div></div>; }
function formatDate(value: string): string { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)); }
function statusDetail(value: unknown): string { if (!value || typeof value !== "object") return "No carrier status detail recorded."; const state = (value as Record<string, unknown>).state; return state ? `Carrier status: ${String(state)}.` : "Carrier status detail is available in the number record."; }
function payloadDetail(value: unknown): string { if (!value || typeof value !== "object") return "No event detail recorded."; const row = value as Record<string, unknown>; return String(row.error || row.reason || row.message || "Review the event payload and related ledger rows."); }
