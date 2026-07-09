import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Start for $1 - ReKnock" };

/* Placeholder signup for the concierge phase.
   TODO: replace TALLY_FORM_URL with your real Tally/Formspree link,
   then replace this whole page with Stripe Checkout. */
const TALLY_FORM_URL = "https://tally.so/r/KYyEjV";

export default function Signup() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Early access</p>
      <h1 className="display text-5xl md:text-6xl">
        We're onboarding the first contractors by hand.
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-slate">
        I&apos;m Sam, and ReKnock is brand new - so I set up every account
        personally. Your voice, your trade, your first quotes, done with you
        in about ten minutes. Your first week is a dollar.
      </p>
      <div className="card mt-8 p-6">
        {TALLY_FORM_URL === "#" ? (
          <p className="text-slate">
            <span className="font-semibold text-ink">Grab a founding spot:</span>{" "}
            email{" "}
            <a
              href="mailto:hello@getreknock.com"
              className="font-semibold text-blue underline"
            >
              hello@getreknock.com
            </a>{" "}
            with your trade and how many quotes you send a month. Same-day
            reply, from a person.
          </p>
        ) : (
          <a
            href={TALLY_FORM_URL}
            className="inline-block rounded-xl bg-blue px-8 py-4 text-lg font-semibold text-white hover:bg-blue-deep"
          >
            Request early access →
          </a>
        )}
      </div>
      <Link href="/" className="mt-10 text-mist underline">← Back to home</Link>
    </main>
  );
}
