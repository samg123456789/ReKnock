import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getActingCompany } from "@/lib/acting-company";
import DashboardTable, { type ProspectRow } from "@/components/app/DashboardTable";
import EducationCards from "@/components/app/EducationCards";
import NumberPicker from "@/components/app/NumberPicker";
import { intakeEmailForSlug } from "@/lib/intake-email";

export const metadata: Metadata = { title: "Dashboard - ReKnock" };

export default async function AppHome() {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  const cid = acting.companyId;
  const sb = acting.client;

  // Independent queries run in parallel.
  const [{ data: company }, { data: prospects }, { data: messages }, { data: phone }, { data: owner }] =
    cid
      ? await Promise.all([
          sb.from("companies").select("name, forwarding_slug, feature_tour_done_at").eq("id", cid).maybeSingle(),
          sb
            .from("prospects")
            .select("id, first_name, last_name, job_type, quote_amount, quote_date, status, campaign_id, source, created_at")
            .eq("company_id", cid)
            .is("deleted_at", null)
            .order("created_at", { ascending: false }),
          sb
            .from("messages")
            .select("prospect_id, direction, status, kind, scheduled_for, created_at")
            .eq("company_id", cid)
            .limit(5000),
          sb.from("phone_numbers").select("status, e164").eq("company_id", cid).maybeSingle(),
          sb.from("users").select("cell_phone, cell_phone_verified_at").eq("company_id", cid).not("cell_phone", "is", null).limit(1).maybeSingle(),
        ])
      : [{ data: null }, { data: [] }, { data: [] }, { data: null }, { data: null }];

  const numberLive = phone?.status === "active";
  const hasQuotes = (prospects?.length ?? 0) > 0;

  // Per-prospect: last activity (sent/received only) + the next scheduled
  // send, straight from the engine's scheduled rows (source of truth).
  const lastAct = new Map<string, string>();
  const nextSend = new Map<string, string>();
  for (const m of messages ?? []) {
    if (!m.prospect_id) continue;
    if (m.status === "scheduled") {
      const cur = nextSend.get(m.prospect_id);
      const when = m.scheduled_for ?? m.created_at;
      if (!cur || when < cur) nextSend.set(m.prospect_id, when);
      continue;
    }
    if (m.status === "canceled") continue;
    const prev = lastAct.get(m.prospect_id);
    if (!prev || m.created_at > prev) lastAct.set(m.prospect_id, m.created_at);
  }

  const rows: ProspectRow[] = (prospects ?? []).map((p) => {
    let next: string | null = null;
    if (p.status === "sequencing" || p.status === "paused") {
      next = nextSend.get(p.id)?.slice(0, 10) ?? null;
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

  const forwardingEmail = intakeEmailForSlug(company?.forwarding_slug);
  // Forwarding is "in use" once any prospect arrived by email (forward or BCC).
  const hasEmailProspect = (prospects ?? []).some((p) => p.source === "email_forward" || p.source === "bcc");
  // One-time feature tour: dashboard implies onboarded; show until the
  // durable company flag is set (written when the tour is closed any way).
  const showTour = cid != null && company != null && !company.feature_tour_done_at;
  const chasingCount = rows.filter((r) => r.status === "sequencing").length;
  const replyCount = rows.filter((r) => r.status === "replied").length;
  const wonCount = rows.filter((r) => r.status === "won").length;
  const nextTouchCount = rows.filter((r) => Boolean(r.nextTouch)).length;
  const numberState = numberLive ? "Live" : phone ? "Activating" : "Not chosen";

  return (
    <main className="app-bg">
      <div className="app-shell">
        <section className="ai-panel overflow-hidden p-5 md:p-7">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <span className="ai-chip">AI follow-up engine</span>
              <h1 className="display mt-4 text-3xl md:text-5xl">{company?.name ? `Welcome, ${company.name}.` : "Welcome."}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate md:text-base">
                ReKnock turns quiet quotes into managed conversations: follow-ups draft in your voice, replies route to email and the inbox, and the chase stops the moment a customer answers.
              </p>
            </div>
            <Link href="/app/quotes/new" className="btn btn-primary btn-lg shrink-0">
              Add a quote
            </Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Quotes", String(rows.length), hasQuotes ? `${chasingCount} actively chasing` : "Add the first one"],
              ["Replies", String(replyCount), "Ready for email/app takeover"],
              ["Won", String(wonCount), "Closed from followed-up quotes"],
              ["Number", numberState, numberLive ? "Texts and calls are live" : phone ? "Carrier activation in progress" : "Choose a local line"],
            ].map(([label, value, hint]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="surface-label">{label}</p>
                <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate">{hint}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Setup chrome earns its place only while setup is incomplete; a
            day-30 dashboard leads with the work. */}
        {!numberLive ? (
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            <span className="ai-chip">Voice ready</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-line bg-white px-3 py-1 font-semibold text-slate">
              {phone ? <>Number activating</> : <>Pick your number below</>}
            </span>
          </div>
        ) : null}

        {!hasQuotes ? (
          <NumberPicker
            phone={phone ? { e164: phone.e164, status: phone.status ?? "" } : null}
            defaultAreaCode={(owner?.cell_phone ?? "").replace(/^\+1/, "").slice(0, 3) || "516"}
          />
        ) : null}

        {!hasQuotes ? (
          <div className="app-panel mt-8 border-blue/30 p-7 text-center">
            <span className="ai-chip">Next best action</span>
            <h2 className="display mt-4 text-3xl">Add your first quote</h2>
            <p className="mx-auto mt-3 max-w-md leading-relaxed text-slate">
              Drop in a job you just quoted. ReKnock will read the quote, draft the chase in your voice, and show every scheduled touch before anything sends.
            </p>
            <Link href="/app/quotes/new" className="mt-6 inline-flex btn btn-primary btn-lg">
              Add your first quote
            </Link>
            <p className="mt-4 text-sm text-slate">
              Want to see the tone first?{" "}
              <a href="https://getreknock.com/blog/follow-up-text-templates-for-contractors" className="font-semibold text-blue underline" target="_blank" rel="noreferrer">
                Open the follow-up playbook
              </a>
            </p>
          </div>
        ) : (
          <section className="app-panel mt-8 p-4 md:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="surface-label">Pipeline</p>
                <h2 className="display mt-1 text-2xl">Your quotes</h2>
                <p className="mt-1 text-sm text-slate">
                  {nextTouchCount ? `${nextTouchCount} scheduled follow-up${nextTouchCount === 1 ? "" : "s"} coming up.` : "No scheduled follow-ups need attention right now."}
                </p>
              </div>
              <Link href="/app/quotes/new" className="btn btn-primary btn-sm">
                Add a quote
              </Link>
            </div>
            <DashboardTable rows={rows} />
          </section>
        )}

        {hasQuotes ? (
          <NumberPicker
            phone={phone ? { e164: phone.e164, status: phone.status ?? "" } : null}
            defaultAreaCode={(owner?.cell_phone ?? "").replace(/^\+1/, "").slice(0, 3) || "516"}
          />
        ) : null}

        <EducationCards
          relayCell={owner?.cell_phone_verified_at ? owner.cell_phone : null}
          reknockNumber={phone?.e164 ? { e164: phone.e164, status: phone.status ?? "" } : null}
          forwardingEmail={forwardingEmail}
          hasEmailProspect={hasEmailProspect}
          introduce={showTour}
        />
      </div>
    </main>
  );
}
