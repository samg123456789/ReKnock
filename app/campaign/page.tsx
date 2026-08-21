import type { Metadata } from "next";
import { getDefaultCampaign } from "@/lib/campaign-actions";
import CampaignEditor from "@/components/app/CampaignEditor";

export const metadata: Metadata = { title: "Campaign - ReKnock" };

export default async function CampaignPage() {
  const steps = await getDefaultCampaign();
  return (
    <main className="app-bg">
      <div className="app-shell max-w-3xl">
        <span className="ai-chip">Follow-up brain</span>
        <h1 className="display mt-4 text-3xl md:text-4xl">How we chase every quote.</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate">
          This is the sequence ReKnock uses for each new quote, in your voice. Edit the timing, choose each message purpose, preview any draft, or turn a step off.
        </p>
        <CampaignEditor initialSteps={steps} />
      </div>
    </main>
  );
}
