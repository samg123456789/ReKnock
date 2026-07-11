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

  // Load any saved state so onboarding is resumable and editable later.
  const { data: company } = await supabase
    .from("companies")
    .select("name, trade, website, description, timezone")
    .single();

  const { data: voice } = await supabase
    .from("voice_profiles")
    .select("questionnaire, master_prompt, sample_messages")
    .eq("is_latest", true)
    .maybeSingle();

  const { data: windows } = await supabase
    .from("sending_windows")
    .select("day_of_week, start_time, end_time, enabled")
    .order("day_of_week", { ascending: true });

  const initialProfile: VoiceProfileResult | null =
    voice?.master_prompt
      ? { master_prompt: voice.master_prompt, samples: (voice.sample_messages as string[]) ?? [] }
      : null;

  return (
    <main className="min-h-[70vh]">
      <OnboardingWizard
        initialBasics={{
          name: company?.name ?? "",
          trade: company?.trade ?? "",
          website: company?.website ?? "",
          description: company?.description ?? "",
          timezone: company?.timezone ?? "",
        }}
        initialQuestionnaire={(voice?.questionnaire as VoiceQuestionnaire) ?? null}
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
      />
    </main>
  );
}
