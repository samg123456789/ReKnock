import Link from "next/link";
import { retryProductAgentEvent } from "@/lib/company-os/product-agent-actions";
import { requireAdmin } from "@/lib/admin";
import { AGENT_NAMES, AGENT_REGISTRY } from "@/lib/company-os/agent-registry";

export const metadata = { title: "Company OS - ReKnock" };
export const dynamic = "force-dynamic";

type ProductRun = {
  id: string;
  agent_event_id: string;
  created_at: string;
  status: string;
  repository: string | null;
  branch: string | null;
  commit_sha: string | null;
  commit_count: number | null;
  summary: string | null;
  product_ideas: unknown;
  user_experience_notes: unknown;
  growth_revenue_notes: unknown;
  risks: unknown;
  action_items: unknown;
  email_to: string | null;
  email_sent_at: string | null;
  error: string | null;
};

type ChangelogEntry = {
  id: string;
  created_at: string;
  title: string;
  body: string;
  repository: string | null;
  branch: string | null;
  commit_sha: string | null;
  commit_count: number | null;
  product_area: string | null;
  customer_impact: string | null;
  compare_url: string | null;
};

type AgentTaskEntry = {
  id: string;
  agent: string;
  task_type: string;
  status: string;
  priority: number;
  risk: string;
  title: string;
  source: string;
  created_at: string;
  error: string | null;
  approval_required: boolean;
};

type AgentApprovalEntry = {
  id: string;
  agent: string;
  status: string;
  title: string;
  summary: string | null;
  draft_content: string | null;
  channel: string | null;
  created_at: string;
};

export default async function CompanyOsPage() {
  const { admin } = await requireAdmin();

  const [{ data: runs }, { data: changelog }, queued, failed, { data: tasks }, { data: approvals }] = await Promise.all([
    admin
      .from("product_agent_runs")
      .select("id, agent_event_id, created_at, status, repository, branch, commit_sha, commit_count, summary, product_ideas, user_experience_notes, growth_revenue_notes, risks, action_items, email_to, email_sent_at, error")
      .order("created_at", { ascending: false })
      .limit(12),
    admin
      .from("product_changelog_entries")
      .select("id, created_at, title, body, repository, branch, commit_sha, commit_count, product_area, customer_impact, compare_url")
      .order("created_at", { ascending: false })
      .limit(8),
    admin.from("agent_events").select("id", { count: "exact", head: true }).eq("status", "queued"),
    admin.from("agent_events").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin
      .from("agent_tasks")
      .select("id, agent, task_type, status, priority, risk, title, source, created_at, error, approval_required")
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("agent_approvals")
      .select("id, agent, status, title, summary, draft_content, channel, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const latestRun = (runs?.[0] as ProductRun | undefined) ?? null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-sm font-semibold text-blue">
            Admin
          </Link>
          <h1 className="display mt-2 text-3xl">Company OS</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate">
            Internal agent runs, product changelog entries, and approval-oriented recommendations.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Metric label="Latest" value={latestRun ? latestRun.status : "none"} />
          <Metric label="Queued" value={String(queued.count ?? 0)} />
          <Metric label="Failed" value={String(failed.count ?? 0)} />
        </div>
      </div>

      <section>
        <h2 className="display text-xl">Agent Registry</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {AGENT_NAMES.map((agent) => {
            const definition = AGENT_REGISTRY[agent];
            const agentTasks = ((tasks ?? []) as AgentTaskEntry[]).filter((task) => task.agent === agent);
            const open = agentTasks.filter((task) => task.status === "queued" || task.status === "claimed").length;
            return (
              <article key={agent} className="surface-card">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">{definition.name}</h3>
                  <span className="rounded-full bg-blue/10 px-2 py-0.5 text-xs font-bold text-blue">{definition.operatingMode.replace("_", " ")}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate">{definition.description}</p>
                <p className="mt-3 text-xs text-mist">Schedule: {definition.schedule} · Open tasks: {open}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-end justify-between gap-3">
          <h2 className="display text-xl">Pending Approvals</h2>
          <span className="text-sm text-mist">{approvals?.length ?? 0} shown</span>
        </div>
        <div className="mt-3 grid gap-3">
          {((approvals ?? []) as AgentApprovalEntry[]).map((approval) => (
            <article key={approval.id} className="surface-card border-amber-200">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">pending</span>
                    <span className="text-xs font-bold uppercase text-mist">{approval.agent} · {approval.channel ?? "review"}</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-ink">{approval.title}</h3>
                  <p className="mt-1 text-xs text-mist">{formatDate(approval.created_at)}</p>
                </div>
              </div>
              {approval.summary ? <p className="mt-3 text-sm text-slate">{approval.summary}</p> : null}
              {approval.draft_content ? <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-snow p-3 text-sm leading-6 text-slate">{approval.draft_content}</pre> : null}
            </article>
          ))}
          {!approvals?.length ? <Empty text="No pending approvals. Signal drafts remain internal until a human reviews them." /> : null}
        </div>
      </section>

      <section>
        <h2 className="display text-xl">Product Changelog</h2>
        <div className="mt-3 grid gap-3">
          {((changelog ?? []) as ChangelogEntry[]).map((entry) => (
            <article key={entry.id} className="surface-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-ink">{entry.title}</h3>
                  <p className="mt-1 text-xs text-mist">
                    {entry.repository ?? "unknown repo"} · {entry.branch ?? "unknown branch"} · {shortSha(entry.commit_sha)} · {formatDate(entry.created_at)}
                  </p>
                </div>
                {entry.compare_url ? (
                  <a href={entry.compare_url} className="text-sm font-semibold text-blue">
                    Compare
                  </a>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-slate">{entry.body}</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <Info label="Area" value={entry.product_area ?? "Unknown"} />
                <Info label="Customer impact" value={entry.customer_impact ?? "Needs review"} />
              </div>
            </article>
          ))}
          {!changelog?.length ? <Empty text="No product changelog entries yet. The first GitHub push will create one." /> : null}
        </div>
      </section>

      <section>
        <h2 className="display text-xl">Control-Plane Tasks</h2>
        <div className="mt-3 grid gap-2">
          {((tasks ?? []) as AgentTaskEntry[]).map((task) => (
            <article key={task.id} className="surface-card-compact flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(task.status)}`}>{task.status}</span>
                  <span className="text-xs font-bold uppercase text-mist">{task.agent} · {task.task_type}</span>
                  {task.approval_required ? <span className="text-xs font-semibold text-amber-700">approval required</span> : null}
                </div>
                <h3 className="mt-1 font-semibold text-ink">{task.title}</h3>
                <p className="mt-1 text-xs text-mist">{task.source} · priority {task.priority} · risk {task.risk} · {formatDate(task.created_at)}</p>
              </div>
              {task.error ? <p className="max-w-md text-sm text-red-700">{task.error}</p> : null}
            </article>
          ))}
          {!tasks?.length ? <Empty text="No Compass, Forge, or Signal tasks have been created yet." /> : null}
        </div>
      </section>

      <section>
        <h2 className="display text-xl">Agent Runs</h2>
        <div className="mt-3 grid gap-3">
          {((runs ?? []) as ProductRun[]).map((run) => (
            <article key={run.id} className="surface-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${statusClass(run.status)}`}>{run.status}</span>
                    <h3 className="font-semibold text-ink">
                      {run.repository ?? "unknown repo"} · {run.branch ?? "unknown branch"}
                    </h3>
                  </div>
                  <p className="mt-1 text-xs text-mist">
                    {formatDate(run.created_at)} · {run.commit_count ?? 0} commits · email {run.email_sent_at ? "sent" : "not sent"}
                  </p>
                </div>
                <code className="text-xs text-mist">{shortSha(run.commit_sha)}</code>
              </div>
              {run.summary ? <p className="mt-3 text-sm leading-6 text-slate">{run.summary}</p> : null}
              {run.error ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{run.error}</p> : null}
              {run.status === "failed" ? (
                <form className="mt-3">
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm"
                    formAction={async () => {
                      "use server";
                      await retryProductAgentEvent(run.agent_event_id);
                    }}
                  >
                    Retry run
                  </button>
                </form>
              ) : null}
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <ListBlock title="Action Items" items={toStrings(run.action_items)} />
                <ListBlock title="Risks" items={toStrings(run.risks)} />
                <ListBlock title="Product Ideas" items={toStrings(run.product_ideas)} />
                <ListBlock title="Growth Notes" items={toStrings(run.growth_revenue_notes)} />
              </div>
            </article>
          ))}
          {!runs?.length ? <Empty text="No agent runs yet. Add the GitHub webhook and push to trigger one." /> : null}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card min-w-24 min-h-0 px-3 py-3">
      <div className="text-xs text-mist">{label}</div>
      <div className="mt-1 text-sm font-bold text-ink">{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card-compact bg-snow">
      <div className="text-xs font-semibold uppercase text-mist">{label}</div>
      <div className="mt-1 text-sm text-slate">{value}</div>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-bold uppercase text-mist">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-1 text-sm text-slate">
          {items.map((item, idx) => (
            <li key={`${title}-${idx}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-mist">None</p>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="surface-card border-dashed border-slate/20 text-sm text-mist">{text}</div>;
}

function toStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function shortSha(value: string | null): string {
  return value ? value.slice(0, 7) : "no sha";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClass(status: string): string {
  if (status === "completed") return "bg-green-50 text-green-700";
  if (status === "failed") return "bg-red-50 text-red-700";
  return "bg-blue/10 text-blue";
}
