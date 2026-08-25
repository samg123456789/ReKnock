import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import SettingsClient from "@/components/settings/SettingsClient";
import type { VoiceQuestionnaire } from "@/lib/prompts/voice-profile";
import type { BusinessIdentity } from "@/lib/twilio-business-profile";
import { intakeEmailForSlug } from "@/lib/intake-email";

export const metadata: Metadata = { title: "Settings - ReKnock" };

export default async function Settings() {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  const cid = acting.companyId;
  const sb = acting.client;
  if (!cid) redirect("/app");

  // Independent queries run in parallel (was 5 serial round-trips).
  const [{ data: company }, { data: voice }, { data: windows }, { data: owner }, { data: phone }, { data: senders }, { data: interests }] =
    await Promise.all([
      sb
        .from("companies")
        .select("name, website, description, trades, trade, timezone, forwarding_slug, avg_quote_amount, quotes_per_month, legal_name, brand_name, business_type, has_tax_id, tax_id_type, business_industry, business_address_street, business_address_street2, business_address_city, business_address_region, business_address_postal_code, business_address_country, social_media_urls, business_regions_of_operation, authorized_first_name, authorized_last_name, authorized_title, authorized_job_position, authorized_phone, brand_contact_email")
        .eq("id", cid)
        .maybeSingle(),
      sb
        .from("voice_profiles")
        .select("questionnaire, master_prompt, sample_messages")
        .eq("company_id", cid)
        .eq("is_latest", true)
        .maybeSingle(),
      sb
        .from("sending_windows")
        .select("day_of_week, start_time, end_time, enabled")
        .eq("company_id", cid)
        .order("day_of_week", { ascending: true }),
      sb.from("users").select("cell_phone, cell_phone_verified_at").eq("company_id", cid).not("cell_phone", "is", null).limit(1).maybeSingle(),
      sb.from("phone_numbers").select("status, e164").eq("company_id", cid).maybeSingle(),
      sb.from("company_sender_emails").select("id, email, verified_at").eq("company_id", cid).order("created_at", { ascending: true }),
      sb.from("events").select("payload").eq("company_id", cid).eq("type", "feature_interest"),
    ]);

  const rawQ = voice?.questionnaire as Record<string, unknown> | null;

  return (
    <main className="app-bg">
      <div className="app-shell max-w-3xl">
        <span className="ai-chip">Workspace settings</span>
        <h1 className="display mt-4 text-3xl md:text-4xl">Your account</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
          Tune the pieces that shape the AI follow-up engine: quote intake, owner handoff, sending hours, and voice.
        </p>
        <SettingsClient
          initialBasics={{
            name: company?.name ?? "",
            website: company?.website ?? "",
            description: company?.description ?? "",
            heard_about: "",
            avg_quote_amount: company?.avg_quote_amount != null ? String(company.avg_quote_amount) : "",
            quotes_per_month: company?.quotes_per_month != null ? String(company.quotes_per_month) : "",
          }}
          businessIdentity={company?.legal_name ? {
            legal_name: company.legal_name ?? "",
            brand_name: company.brand_name ?? company.name ?? "",
            business_type: (company.business_type ?? "sole_proprietor") as BusinessIdentity["business_type"],
            has_tax_id: Boolean(company.has_tax_id),
            tax_id_type: company.tax_id_type ?? "EIN",
            tax_id: "",
            business_industry: company.business_industry ?? "CONSTRUCTION",
            business_address_street: company.business_address_street ?? "",
            business_address_street2: company.business_address_street2 ?? "",
            business_address_city: company.business_address_city ?? "",
            business_address_region: company.business_address_region ?? "",
            business_address_postal_code: company.business_address_postal_code ?? "",
            business_address_country: company.business_address_country ?? "US",
            social_media_urls: Array.isArray(company.social_media_urls) ? company.social_media_urls.join("\n") : "",
            business_regions_of_operation: Array.isArray(company.business_regions_of_operation) ? company.business_regions_of_operation.join(", ") : "USA_AND_CANADA",
            authorized_first_name: company.authorized_first_name ?? "",
            authorized_last_name: company.authorized_last_name ?? "",
            authorized_title: company.authorized_title ?? "",
            authorized_job_position: company.authorized_job_position ?? "Other",
            authorized_phone: company.authorized_phone ?? "",
            brand_contact_email: company.brand_contact_email ?? "",
          } satisfies BusinessIdentity : null}
          initialTrades={Array.isArray(company?.trades) ? (company!.trades as string[]) : company?.trade ? [company.trade] : []}
          initialTimezone={company?.timezone ?? "America/New_York"}
          initialWindows={
            windows && windows.length
              ? windows.map((w) => ({ day_of_week: w.day_of_week, start_time: (w.start_time as string).slice(0, 5), end_time: (w.end_time as string).slice(0, 5), enabled: w.enabled }))
              : null
          }
          questionnaire={rawQ && Array.isArray(rawQ.samples) ? (rawQ as unknown as VoiceQuestionnaire) : null}
          masterPrompt={voice?.master_prompt ?? ""}
          samples={(voice?.sample_messages as string[]) ?? []}
          relayCell={owner?.cell_phone ?? ""}
          relayCellVerified={owner?.cell_phone_verified_at != null}
          forwardingAddress={intakeEmailForSlug(company?.forwarding_slug)}
          senderEmails={(senders ?? []).map((s) => ({ id: s.id as string, email: s.email as string, verified: s.verified_at != null }))}
          numberStatus={phone?.status ?? null}
          numberE164={phone?.e164 ?? null}
          initialNotified={Array.from(
            new Set(
              (interests ?? [])
                .map((e) => ((e.payload as Record<string, unknown> | null)?.feature as string) ?? "")
                .filter(Boolean),
            ),
          )}
        />
      </div>
    </main>
  );
}
