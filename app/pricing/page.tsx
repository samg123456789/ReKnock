import type { Metadata } from "next";
import PricingClient from "@/components/PricingClient";
import { foundingStatus } from "@/lib/founding";

export const metadata: Metadata = {
  title: "Pricing - ReKnock",
  description:
    "ReKnock pricing: Starter is $79/month, with a founding rate of $39/month locked for life for the first 20 contractors. Annual billing includes two months free.",
  alternates: { canonical: "https://getreknock.com/pricing" },
};

// Re-check the founding-spots count at most once a minute.
export const revalidate = 60;

export default async function Pricing() {
  // Real founding-spots count; fall back to the full allotment if the query fails.
  let spotsLeft = 20;
  try {
    spotsLeft = (await foundingStatus()).spotsLeft;
  } catch {
    // Keep the fallback. The page must render even if the count query is down.
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "ReKnock",
    description: "Automatic SMS follow-up for contractor quotes.",
    offers: [
      { "@type": "Offer", name: "Starter (standard, monthly)", price: "79", priceCurrency: "USD" },
      { "@type": "Offer", name: "Starter (standard, annual)", price: "790", priceCurrency: "USD" },
      { "@type": "Offer", name: "Starter (founding, monthly)", price: "39", priceCurrency: "USD" },
      { "@type": "Offer", name: "Starter (founding, annual)", price: "390", priceCurrency: "USD" },
    ],
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PricingClient spotsLeft={spotsLeft} />
    </main>
  );
}
