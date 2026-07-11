import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import SettingsClient from "@/components/settings/SettingsClient";
import type { VoiceQuestionnaire } from "@/lib/prompts/voice-profile";

export const metadata: Metadata = { title: "Settings - ReKnock" };

export default async function Settings() {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  const cid = acting.companyId;
  const sb = acting.client;
  if (!cid) redirect("/app");

  const { data: company } = await sb
    .from("companies")
    .select("name, website, description, trades, trade, timezone, forwarding_slug, avg_quote_amount, quotes_per_month")
    .eq("id", cid)
    .maybeSingle();
  const { data: voice } = await sb
    .from("voice_profiles")
    .select("questionnaire, master_prompt, sample_messages")
    .eq("company_id", cid)
    .eq("is_latest", true)
    .maybeSingle();
  const { data: windows } = await sb
    .from("sending_windows")
    .select("day_of_week, start_time, end_time, enabled")
    .eq("company_id", cid)
    .order("day_of_week", { ascending: true });
  const { data: owner } = await sb.from("users").select("cell_phone").eq("company_id", cid).not("cell_phone", "is", null).limit(1).maybeSingle();
  const { data: phone } = await sb.from("phone_numbers").select("status, e164").eq("company_id", cid).maybeSingle();

  const rawQ = voice?.questionnaire as Record<string, unknown> | null;

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="eyebrow mb-2">Settings</p>
      <h1 className="display text-3xl">Your account</h1>
      <SettingsClient
        initialBasics={{
          name: company?.name ?? "",
          website: company?.website ?? "",
          description: company?.description ?? "",
          heard_about: "",
          avg_quote_amount: company?.avg_quote_amount != null ? String(company.avg_quote_amount) : "",
          quotes_per_month: company?.quotes_per_month != null ? String(company.quotes_per_month) : "",
        }}
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
        forwardingAddress={company?.forwarding_slug ? `${company.forwarding_slug}@in.getreknock.com` : ""}
        numberStatus={phone?.status ?? null}
        numberE164={phone?.e164 ?? null}
      />
    </main>
  );
}
