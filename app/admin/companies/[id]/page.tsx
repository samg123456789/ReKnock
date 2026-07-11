import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import CompanyActions from "@/components/admin/CompanyActions";

export const metadata = { title: "Customer - ReKnock Admin" };

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "-";
}

export default async function CompanyDetail({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requireAdmin();
  const { id } = await params;

  const { data: company } = await admin.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) notFound();

  const [{ data: users }, { data: voice }, { data: prospects }, { data: events }, { data: failed }] = await Promise.all([
    admin.from("users").select("email, full_name, cell_phone").eq("company_id", id),
    admin.from("voice_profiles").select("master_prompt, sample_messages, version").eq("company_id", id).eq("is_latest", true).maybeSingle(),
    admin.from("prospects").select("id, first_name, last_name, phone_e164, status, job_type, quote_amount, created_at").eq("company_id", id).order("created_at", { ascending: false }).limit(50),
    admin.from("events").select("type, payload, created_at").eq("company_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("failed_jobs").select("job_type, error, created_at").eq("company_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  const owner = users?.[0];
  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mt-6">
      <h2 className="display text-lg">{title}</h2>
      <div className="mt-2 rounded-xl border border-sky-line p-4 text-sm">{children}</div>
    </section>
  );

  return (
    <div>
      <Link href="/admin" className="cursor-pointer text-sm text-blue hover:underline">← All customers</Link>
      <h1 className="display mt-2 text-2xl">
        {company.name ?? "(no name)"}
        {company.suspended_at ? <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 align-middle">Suspended</span> : null}
      </h1>
      <CompanyActions companyId={company.id} companyName={company.name ?? ""} suspended={Boolean(company.suspended_at)} />

      <Section title="Profile">
        <div className="grid grid-cols-2 gap-2 text-slate">
          <span>Email</span><span className="text-ink">{owner?.email ?? "-"}</span>
          <span>Owner</span><span className="text-ink">{owner?.full_name ?? "-"}</span>
          <span>Relay cell</span><span className="text-ink">{owner?.cell_phone ?? "not set"}</span>
          <span>Trades</span><span className="text-ink">{Array.isArray(company.trades) ? company.trades.join(", ") : company.trade ?? "-"}</span>
          <span>Website</span><span className="text-ink">{company.website ?? "-"}</span>
          <span>Timezone</span><span className="text-ink">{company.timezone ?? "-"}</span>
          <span>Plan / status</span><span className="text-ink">{company.plan ?? "-"} / {company.subscription_status ?? "-"}</span>
          <span>Trial used</span><span className="text-ink">{company.trial_messages_used ?? 0}</span>
          <span>Onboarded</span><span className="text-ink">{fmt(company.onboarded_at)}</span>
        </div>
      </Section>

      <Section title={`Voice profile ${voice ? `(v${voice.version})` : ""}`}>
        {voice?.master_prompt ? (
          <details>
            <summary className="cursor-pointer font-semibold text-slate">View master prompt</summary>
            <p className="mt-2 whitespace-pre-wrap text-slate">{voice.master_prompt}</p>
          </details>
        ) : (
          <span className="text-mist">No voice profile yet.</span>
        )}
      </Section>

      <Section title={`Prospects (${prospects?.length ?? 0})`}>
        {prospects?.length ? (
          <div className="flex flex-col gap-1.5">
            {prospects.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="font-semibold text-ink">{p.first_name} {p.last_name ?? ""}</span>
                <span className="text-mist">{p.job_type ?? ""}</span>
                <span className="ml-auto rounded-full bg-sky px-2 py-0.5 text-xs font-semibold text-blue">{p.status}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-mist">No prospects yet.</span>
        )}
      </Section>

      <Section title="Recent events">
        {events?.length ? (
          <ul className="flex flex-col gap-1 font-mono text-xs text-slate">
            {events.map((e, i) => (
              <li key={i}><span className="text-mist">{fmt(e.created_at)}</span> {e.type}</li>
            ))}
          </ul>
        ) : (
          <span className="text-mist">No events.</span>
        )}
      </Section>

      <Section title="Failed jobs">
        {failed?.length ? (
          <ul className="flex flex-col gap-1 font-mono text-xs text-red-700">
            {failed.map((f, i) => (
              <li key={i}><span className="text-mist">{fmt(f.created_at)}</span> {f.job_type}: {f.error}</li>
            ))}
          </ul>
        ) : (
          <span className="text-mint">None. Clean.</span>
        )}
      </Section>
    </div>
  );
}
