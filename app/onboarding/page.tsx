import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import type { VoiceQuestionnaire, VoiceProfileResult } from "@/lib/prompts/voice-profile";
import type { BusinessIdentity } from "@/lib/twilio-business-profile";

export const metadata: Metadata = { title: "Set up your account - ReKnock" };

export default async function Onboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Independent queries run in parallel (was 3 serial round-trips).
  const [{ data: company }, { data: voice }, { data: windows }, { data: phone }, { data: owner }, { data: legalAcceptance }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, website, description, trades, trade, heard_about, avg_quote_amount, quotes_per_month, timezone, legal_name, brand_name, business_type, has_tax_id, tax_id_type, business_industry, business_address_street, business_address_street2, business_address_city, business_address_region, business_address_postal_code, business_address_country, social_media_urls, business_regions_of_operation, authorized_first_name, authorized_last_name, authorized_title, authorized_job_position, authorized_phone, brand_contact_email")
      .single(),
    supabase
      .from("voice_profiles")
      .select("questionnaire, master_prompt, sample_messages")
      .eq("is_latest", true)
      .maybeSingle(),
    supabase
      .from("sending_windows")
      .select("day_of_week, start_time, end_time, enabled")
      .order("day_of_week", { ascending: true }),
    supabase.from("phone_numbers").select("id").neq("status", "released").limit(1).maybeSingle(),
    supabase.from("users").select("cell_phone, cell_phone_verified_at").not("cell_phone", "is", null).limit(1).maybeSingle(),
    supabase.from("events").select("id").eq("type", "legal_terms_accepted").limit(1).maybeSingle(),
  ]);

  const initialProfile: VoiceProfileResult | null = voice?.master_prompt
    ? { master_prompt: voice.master_prompt, samples: (voice.sample_messages as string[]) ?? [] }
    : null;

  // Only reuse a stored questionnaire if it matches the current shape.
  const rawQ = voice?.questionnaire as Record<string, unknown> | null;
  const initialQuestionnaire =
    rawQ && Array.isArray(rawQ.samples) ? (rawQ as unknown as VoiceQuestionnaire) : null;

  const initialTrades: string[] = Array.isArray(company?.trades)
    ? (company!.trades as string[])
    : company?.trade
      ? [company.trade]
      : [];

  const businessIdentity = company?.legal_name ? {
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
  } satisfies BusinessIdentity : null;

  // Resume where they left off, derived from what is already saved (no extra
  // column needed). Steps: 0 business, 1 identity, 2 voice questions, 3 voice review,
  // 4 hours, 5 owner phone, 6 number, 7 done (quote volume + heard-about live
  // on the final screen now). A saved voice profile means the review step was
  // approved, sending_windows rows only exist once the hours step saved, a
  // verified owner cell proves calls/urgent alerts route to the right person,
  // and a live phone_numbers row means the number step is done.
  const hasBasics = Boolean(company?.name && initialTrades.length > 0 && (company?.description || company?.website));
  const hasIdentity = Boolean(businessIdentity);
  const hasVoice = Boolean(initialProfile);
  const hasWindows = Boolean(windows && windows.length);
  const hasVerifiedCell = Boolean(owner?.cell_phone && owner.cell_phone_verified_at);
  const hasNumber = Boolean(phone);
  let initialStep = 0;
  if (hasBasics) initialStep = 1;
  if (hasBasics && hasIdentity) initialStep = 2;
  if (hasBasics && hasIdentity && hasVoice) initialStep = 4;
  if (hasBasics && hasIdentity && hasVoice && hasWindows) initialStep = 5;
  if (hasBasics && hasIdentity && hasVoice && hasWindows && hasVerifiedCell) initialStep = 6;
  if (hasBasics && hasIdentity && hasVoice && hasWindows && hasVerifiedCell && hasNumber) initialStep = 7;

  return (
    <main className="min-h-[70vh]">
      <OnboardingWizard
        initialBasics={{
          name: company?.name ?? "",
          website: company?.website ?? "",
          description: company?.description ?? "",
          heard_about: company?.heard_about ?? "",
          avg_quote_amount: company?.avg_quote_amount != null ? String(company.avg_quote_amount) : "",
          quotes_per_month: company?.quotes_per_month != null ? String(company.quotes_per_month) : "",
        }}
        initialTrades={initialTrades}
        initialBusinessIdentity={businessIdentity}
        initialQuestionnaire={initialQuestionnaire}
        initialProfile={initialProfile}
        initialWindows={
          windows && windows.length
            ? windows.map((w) => ({
                day_of_week: w.day_of_week,
                start_time: (w.start_time as string).slice(0, 5),
                end_time: (w.end_time as string).slice(0, 5),
                enabled: w.enabled,
              }))
            : null
        }
        initialTimezone={company?.timezone ?? ""}
        initialStep={initialStep}
        initialRelayCell={owner?.cell_phone ?? ""}
        initialRelayVerified={hasVerifiedCell}
        initialAreaCode={(owner?.cell_phone ?? "").replace(/^\+1/, "").slice(0, 3)}
        initialLegalAccepted={Boolean(legalAcceptance)}
      />
    </main>
  );
}
