import type { Metadata } from "next";
import PricingClient from "@/components/PricingClient";
import { foundingStatus } from "@/lib/founding";

export const metadata: Metadata = {
  title: "Pricing - ReKnock",
  description:
    "Try ReKnock for $1. Then $29/month (or $290/year, 2 months free) locked for life for the first 20 contractors. Automatic quote follow-up texts for the trades.",
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
      { "@type": "Offer", name: "Starter (founding, monthly)", price: "29", priceCurrency: "USD" },
      { "@type": "Offer", name: "Starter (founding, annual)", price: "290", priceCurrency: "USD" },
    ],
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PricingClient spotsLeft={spotsLeft} />
    </main>
  );
}
