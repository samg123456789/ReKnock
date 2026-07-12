import type { Metadata } from "next";
import { getDefaultCampaign } from "@/lib/campaign-actions";
import CampaignEditor from "@/components/app/CampaignEditor";

export const metadata: Metadata = { title: "Campaign - ReKnock" };

export default async function CampaignPage() {
  const steps = await getDefaultCampaign();
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <p className="eyebrow mb-2">Follow-up campaign</p>
      <h1 className="display text-3xl">How we chase every quote.</h1>
      <p className="mt-3 text-slate">
        This is the sequence we run for each new quote, in your voice. Edit the timing, write your own words, preview any
        message, or turn a step off.
      </p>
      <CampaignEditor initialSteps={steps} />
    </main>
  );
}
