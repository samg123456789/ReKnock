import { redirect } from "next/navigation";
import Link from "next/link";
import { getActingCompany } from "@/lib/acting-company";

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  sequencing: "Chasing",
  replied: "Replied",
  won: "Won",
  lost: "Lost",
  opted_out: "Opted out",
  paused: "Paused",
};

export default async function AppHome() {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  const cid = acting.companyId;
  const sb = acting.client;

  // Independent queries run in parallel (was 3 serial round-trips).
  const [{ data: company }, { data: prospects }, { data: phone }] = cid
    ? await Promise.all([
        sb.from("companies").select("name").eq("id", cid).maybeSingle(),
        sb
          .from("prospects")
          .select("id, first_name, last_name, job_type, status, created_at")
          .eq("company_id", cid)
          .order("created_at", { ascending: false })
          .limit(20),
        sb.from("phone_numbers").select("status").eq("company_id", cid).maybeSingle(),
      ])
    : [{ data: null }, { data: [] }, { data: null }];

  const numberLive = phone?.status === "active";
  const hasQuotes = (prospects?.length ?? 0) > 0;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="eyebrow mb-2">Dashboard</p>
      <h1 className="display text-3xl md:text-4xl">{company?.name ? `Welcome, ${company.name}.` : "Welcome."}</h1>

      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-sky px-3 py-1 text-blue-ink">
          <span className="text-mint">✓</span> Your voice is ready
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-line px-3 py-1 text-slate">
          {numberLive ? <><span className="text-mint">✓</span> Number live</> : <>Texting number activating</>}
        </span>
      </div>

      {!hasQuotes ? (
        <div className="card mt-8 border-blue p-7 text-center shadow-[0_16px_48px_-16px_rgba(29,95,219,0.35)]">
          <h2 className="display text-2xl">Add your first quote</h2>
          <p className="mx-auto mt-2 max-w-sm text-slate">
            Drop in a job you just quoted. We&apos;ll show you exactly how and when we&apos;ll chase it, in your voice.
          </p>
          <Link href="/app/quotes/new" className="mt-6 inline-block cursor-pointer rounded-xl bg-blue px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-blue-deep">
            Add your first quote
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="display text-xl">Your quotes</h2>
            <Link href="/app/quotes/new" className="cursor-pointer rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-deep">
              Add a quote
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {prospects!.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-sky-line bg-white px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{p.first_name} {p.last_name ?? ""}</p>
                  <p className="truncate text-sm text-slate">{p.job_type ?? "Quote"}</p>
                </div>
                <span className="ml-auto rounded-full bg-sky px-2.5 py-1 text-xs font-semibold text-blue">
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
