import Link from "next/link";
import { Logo } from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-sky-line bg-blue-ink text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-3">
        <div>
          <Logo mode="dark" />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/70">
            Automatic follow-up texts for contractor quotes. Built for the
            trades, run by a real person.
          </p>
          <p className="mt-4 text-sm text-white/70">
            ReKnock is new. You&apos;ll be talking to Sam, the founder.
          </p>
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
          <p className="eyebrow mb-3 !text-white/60">Resources</p>
          <div className="flex flex-col gap-2">
            <Link className="text-white/85 hover:text-white" href="/blog">Blog</Link>
            <Link className="text-white/85 hover:text-white" href="/roi-calculator">ROI calculator</Link>
            <Link className="text-white/85 hover:text-white" href="/blog/follow-up-text-templates-for-contractors">Free follow-up scripts</Link>
            <Link className="text-white/85 hover:text-white" href="/sms-terms">Text program &amp; consent</Link>
            <Link className="text-white/85 hover:text-white" href="/privacy">Privacy &amp; texting policy</Link>
            <Link className="text-white/85 hover:text-white" href="/terms">Terms &amp; conditions</Link>
            <a className="text-white/85 hover:text-white" href="mailto:hello@getreknock.com">hello@getreknock.com</a>
          </div>
        </div>
      </div>
      <div className="border-t border-white/10 py-5 text-center text-xs text-white/50">
        © {new Date().getFullYear()} ReKnock · getreknock.com
      </div>
    </footer>
  );
}
