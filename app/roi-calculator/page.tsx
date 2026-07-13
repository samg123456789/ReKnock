import type { Metadata } from "next";
import RoiCalculator from "@/components/RoiCalculator";

export const metadata: Metadata = {
  title: "Quote Follow-Up ROI Calculator for Contractors - ReKnock",
  description:
    "Free calculator: plug in your average quote and how many you send a month, and see how much revenue walks away when nobody follows up.",
  alternates: { canonical: "https://getreknock.com/roi-calculator" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Quote Follow-Up ROI Calculator",
  url: "https://getreknock.com/roi-calculator",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Free tool for residential contractors: estimate the revenue lost to quotes that never get a follow-up.",
};

export default function RoiCalculatorPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 md:py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <p className="eyebrow mb-3">Free tool</p>
      <h1 className="display text-4xl md:text-5xl">How much work is walking away un-chased?</h1>
      <p className="mt-4 text-lg text-slate">
        Two numbers you already know. No email required, no signup wall. The math updates as you type.
      </p>
      <RoiCalculator />
      <p className="mt-10 text-sm text-slate">
        Where the assumption comes from: most homeowners get 3 to 5 bids and buy from whoever stays in the
        conversation. If you never follow up, the slider is how much of your quoted work a simple text sequence
        realistically brings back. Read more in{" "}
        <a href="/blog/why-homeowners-ghost-contractor-quotes" className="text-blue underline">
          why homeowners ghost contractor quotes
        </a>
        .
      </p>
    </main>
  );
}
