import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import type { VoiceQuestionnaire, VoiceProfileResult } from "@/lib/prompts/voice-profile";

export const metadata: Metadata = { title: "Set up your account - ReKnock" };

export default async function Onboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Independent queries run in parallel (was 3 serial round-trips).
  const [{ data: company }, { data: voice }, { data: windows }, { data: phone }, { data: owner }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, website, description, trades, trade, heard_about, avg_quote_amount, quotes_per_month, timezone")
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

  // Resume where they left off, derived from what is already saved (no extra
  // column needed). Steps: 0 business, 1 voice questions, 2 voice review,
  // 3 hours, 4 owner phone, 5 number, 6 done (quote volume + heard-about live
  // on the final screen now). A saved voice profile means the review step was
  // approved, sending_windows rows only exist once the hours step saved, a
  // verified owner cell proves calls/urgent alerts route to the right person,
  // and a live phone_numbers row means the number step is done.
  const hasBasics = Boolean(company?.name && initialTrades.length > 0 && (company?.description || company?.website));
  const hasVoice = Boolean(initialProfile);
  const hasWindows = Boolean(windows && windows.length);
  const hasVerifiedCell = Boolean(owner?.cell_phone && owner.cell_phone_verified_at);
  const hasNumber = Boolean(phone);
  let initialStep = 0;
  if (hasBasics) initialStep = 1;
  if (hasBasics && hasVoice) initialStep = 3;
  if (hasBasics && hasVoice && hasWindows) initialStep = 4;
  if (hasBasics && hasVoice && hasWindows && hasVerifiedCell) initialStep = 5;
  if (hasBasics && hasVoice && hasWindows && hasVerifiedCell && hasNumber) initialStep = 6;

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
      />
    </main>
  );
}
