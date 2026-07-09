import type { Metadata } from "next";
import PricingClient from "@/components/PricingClient";

export const metadata: Metadata = {
  title: "Pricing - ReKnock",
  description:
    "Try ReKnock for $1. Then $29/month (or $290/year, 2 months free) locked for life for the first 20 contractors. Automatic quote follow-up texts for the trades.",
  alternates: { canonical: "https://getreknock.com/pricing" },
};

export default function Pricing() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "ReKnock",
    description: "Automatic SMS follow-up for contractor quotes.",
    offers: [
      { "@type": "Offer", name: "Solo (founding, monthly)", price: "29", priceCurrency: "USD" },
      { "@type": "Offer", name: "Solo (founding, annual)", price: "290", priceCurrency: "USD" },
    ],
  };
  return (
    <main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <PricingClient />
    </main>
  );
}
