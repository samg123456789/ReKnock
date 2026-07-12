import { redirect } from "next/navigation";
import Link from "next/link";
import { getActingCompany } from "@/lib/acting-company";
import DashboardTable, { type ProspectRow } from "@/components/app/DashboardTable";
import EducationCards from "@/components/app/EducationCards";
import { DEFAULT_STEPS, nextTouch, type Step } from "@/lib/schedule";

export default async function AppHome() {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  const cid = acting.companyId;
  const sb = acting.client;

  // Independent queries run in parallel.
  const [{ data: company }, { data: prospects }, { data: messages }, { data: campaigns }, { data: phone }, { data: owner }] =
    cid
      ? await Promise.all([
          sb.from("companies").select("name, forwarding_slug").eq("id", cid).maybeSingle(),
          sb
            .from("prospects")
            .select("id, first_name, last_name, job_type, quote_amount, quote_date, status, campaign_id, created_at")
            .eq("company_id", cid)
            .order("created_at", { ascending: false }),
          sb
            .from("messages")
            .select("prospect_id, direction, sequence_step, created_at")
            .eq("company_id", cid)
            .limit(5000),
          sb.from("campaigns").select("id, steps").eq("company_id", cid),
          sb.from("phone_numbers").select("status, e164").eq("company_id", cid).maybeSingle(),
          sb.from("users").select("cell_phone").eq("company_id", cid).not("cell_phone", "is", null).limit(1).maybeSingle(),
        ])
      : [{ data: null }, { data: [] }, { data: [] }, { data: [] }, { data: null }, { data: null }];

  const numberLive = phone?.status === "active";
  const hasQuotes = (prospects?.length ?? 0) > 0;

  // Per-prospect: last activity + which steps already sent (0-based indices).
  const lastAct = new Map<string, string>();
  const sentByProspect = new Map<string, Set<number>>();
  for (const m of messages ?? []) {
    if (!m.prospect_id) continue;
    const prev = lastAct.get(m.prospect_id);
    if (!prev || m.created_at > prev) lastAct.set(m.prospect_id, m.created_at);
    if (m.direction === "outbound" && m.sequence_step != null) {
      const set = sentByProspect.get(m.prospect_id) ?? new Set<number>();
      set.add(m.sequence_step as number);
      sentByProspect.set(m.prospect_id, set);
    }
  }
  const stepsById = new Map<string, Step[]>();
  for (const c of campaigns ?? []) {
    const cs = c.steps as Step[] | null;
    if (Array.isArray(cs) && cs.length) stepsById.set(c.id, cs);
  }

  const rows: ProspectRow[] = (prospects ?? []).map((p) => {
    let next: string | null = null;
    if (p.status === "sequencing") {
      const steps = (p.campaign_id && stepsById.get(p.campaign_id)) || DEFAULT_STEPS;
      const base = p.quote_date ? new Date(`${p.quote_date}T12:00:00Z`) : new Date(p.created_at);
      next = nextTouch(base, steps, sentByProspect.get(p.id) ?? new Set())?.date ?? null;
    }
    return {
      id: p.id,
      name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown",
      jobType: p.job_type ?? "",
      amount: p.quote_amount,
      status: p.status,
      nextTouch: next,
      lastActivity: lastAct.get(p.id) ?? p.created_at,
    };
  });

  const forwardingEmail = company?.forwarding_slug ? `${company.forwarding_slug}@in.getreknock.com` : "";

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="display text-xl">Your quotes</h2>
            <Link href="/app/quotes/new" className="cursor-pointer rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-deep">
              Add a quote
            </Link>
          </div>
          <DashboardTable rows={rows} />
        </div>
      )}

      <EducationCards
        relayCell={owner?.cell_phone ?? null}
        reknockNumber={phone?.e164 ? { e164: phone.e164, status: phone.status ?? "" } : null}
        forwardingEmail={forwardingEmail}
      />
    </main>
  );
}
