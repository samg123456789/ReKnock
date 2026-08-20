import Link from "next/link";
import { Logo } from "./Logo";

export default function Footer() {
  const useCases = [
    "Roofing",
    "Painting",
    "Landscaping",
    "Fencing & decks",
    "Remodeling",
    "Other quoted trades",
  ];

  return (
    <footer className="border-t border-sky-line bg-blue-ink text-white">
      <div className="mx-auto grid max-w-6xl gap-x-8 gap-y-12 px-5 py-14 md:grid-cols-5">
        <div className="md:col-span-2">
          <Logo mode="dark" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
            Automatic follow-up texts for contractor quotes.
          </p>
          <a
            className="mt-6 inline-block break-all text-sm text-white/85 underline underline-offset-4 hover:text-white"
            href="mailto:hello@getreknock.com"
          >
            hello@getreknock.com
          </a>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3 !text-white/60">Product</p>
          <div className="flex flex-col gap-2">
            <Link className="text-white/85 hover:text-white" href="/#how">How it works</Link>
            <Link className="text-white/85 hover:text-white" href="/pricing">Pricing</Link>
            <Link className="text-white/85 hover:text-white" href="/#integrations">Integrations</Link>
            <Link className="text-white/85 hover:text-white" href="/signup">Start for $1</Link>
          </div>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3 !text-white/60">Use cases</p>
          <div className="flex flex-col gap-2">
            {useCases.map((trade) => (
              <Link key={trade} className="text-white/85 hover:text-white" href="/#use-cases">
                {trade}
              </Link>
            ))}
          </div>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3 !text-white/60">Resources</p>
          <div className="flex flex-col gap-2">
            <Link className="text-white/85 hover:text-white" href="/blog">Blog</Link>
            <Link className="text-white/85 hover:text-white" href="/roi-calculator">ROI calculator</Link>
            <Link className="text-white/85 hover:text-white" href="/blog/follow-up-text-templates-for-contractors">Free follow-up scripts</Link>
          </div>
        </div>
        <div className="text-sm">
          <p className="eyebrow mb-3 !text-white/60">Legal</p>
          <div className="flex flex-col gap-2">
            <Link className="text-white/85 hover:text-white" href="/sms-terms">SMS &amp; consent</Link>
            <Link className="text-white/85 hover:text-white" href="/privacy">Privacy &amp; texting policy</Link>
            <Link className="text-white/85 hover:text-white" href="/terms">Terms &amp; conditions</Link>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">
        © {new Date().getFullYear()} ReKnock · getreknock.com
      </div>
    </footer>
  );
}
