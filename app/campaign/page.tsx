import type { Metadata } from "next";
import { createCampaign, getCampaigns } from "@/lib/campaign-actions";
import CampaignEditor from "@/components/app/CampaignEditor";
import { CAMPAIGN_PRESETS } from "@/lib/campaign";

export const metadata: Metadata = { title: "Message campaigns - ReKnock" };

export default async function CampaignPage() {
  const campaigns = await getCampaigns();
  return (
    <main className="app-bg">
      <div className="app-shell max-w-3xl">
        <span className="ai-chip">Message campaigns</span>
        <h1 className="display mt-4 text-3xl md:text-4xl">How we follow up on every quote.</h1>
        <p className="mt-3 max-w-2xl leading-relaxed text-slate">
          Use a different plan only when the job or situation changes. Most contractors should keep Standard for new quotes, use High-value for longer decisions, and use Revive for old quotes that went quiet.
        </p>
        <div className="mt-6 flex flex-col gap-4">
          {campaigns.map((campaign) => <CampaignEditor key={campaign.id} campaignId={campaign.id} campaignName={campaign.name} isDefault={campaign.is_default} initialSteps={campaign.steps} />)}
          <form action={createCampaign} className="app-panel flex flex-col gap-3 border-dashed p-5 sm:flex-row sm:items-end">
            <label className="flex-1"><span className="text-sm font-semibold text-ink">Create another plan</span><input name="name" className="rk-input mt-2 text-sm" placeholder="Commercial jobs or storm leads" /></label>
            <label className="flex-1"><span className="text-sm font-semibold text-ink">Start from</span><select name="preset" className="rk-input mt-2 text-sm">{CAMPAIGN_PRESETS.map((preset) => <option key={preset.key} value={preset.key}>{preset.name} · {preset.description}</option>)}</select></label>
            <button type="submit" className="btn btn-ghost">+ New plan</button>
          </form>
        </div>
      </div>
    </main>
  );
}
