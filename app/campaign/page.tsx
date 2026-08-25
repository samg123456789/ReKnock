import type { Metadata } from "next";
import { createCampaign, getCampaigns } from "@/lib/campaign-actions";
import CampaignEditor from "@/components/app/CampaignEditor";

export const metadata: Metadata = { title: "Message campaigns - ReKnock" };

export default async function CampaignPage() {
  const campaigns = await getCampaigns();
  return (
    <main className="app-bg">
      <div className="app-shell max-w-3xl">
        <span className="ai-chip">Message campaigns</span>
        <h1 className="display mt-4 text-3xl md:text-4xl">How we follow up on every quote.</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate">
          Message campaigns control the timing and purpose of each customer text. Edit the timing, preview drafts in your voice, or turn a touch off.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          {campaigns.map((campaign) => <CampaignEditor key={campaign.id} campaignId={campaign.id} campaignName={campaign.name} isDefault={campaign.is_default} initialSteps={campaign.steps} />)}
          <form action={createCampaign} className="app-panel flex flex-col gap-3 border-dashed p-5 sm:flex-row sm:items-end">
            <label className="flex-1"><span className="text-sm font-semibold text-ink">Create another plan</span><input name="name" className="rk-input mt-2 text-sm" placeholder="Warm leads or smaller jobs" /></label>
            <button type="submit" className="btn btn-ghost">+ New plan</button>
          </form>
        </div>
      </div>
    </main>
  );
}
