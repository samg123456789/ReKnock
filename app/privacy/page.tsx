import Link from "next/link";

/* Plain-English privacy + SMS policy. Exists partly because the 10DLC
   campaign review checks the site for opt-in/opt-out disclosure.
   NOTE: adjust the contact email once mail is set up. Not legal advice -
   have a professional review before scale. */

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="eyebrow mb-4">ReKnock</p>
      <h1 className="display text-5xl">Privacy &amp; texting policy</h1>
      <div className="mt-8 space-y-6 leading-relaxed text-slate">
        <p className="font-mono text-sm text-mist">
          Last updated: July 2026
        </p>

        <h2 className="display pt-2 text-2xl text-ink">What ReKnock does</h2>
        <p>
          ReKnock sends follow-up text messages about quotes and estimates on
          behalf of the contractor you requested a quote from. Messages are
          about your open quote only - never marketing, never third-party
          offers.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Consent</h2>
        <p>
          You receive texts because you gave your phone number to a contractor
          when requesting an estimate and agreed to be contacted about it.
          Message frequency is limited (typically four messages over three
          weeks per quote). Message and data rates may apply.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Opting out</h2>
        <p>
          Reply <strong className="text-ink">STOP</strong> to any message to
          opt out permanently. Reply{" "}
          <strong className="text-ink">HELP</strong> for help. Opting out of
          one contractor&apos;s messages stops all ReKnock messages from that
          contractor.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">What we store</h2>
        <p>
          We store the information needed to run follow-ups: names, phone
          numbers, quote details, message history, and consent records. We do
          not sell personal information. No mobile information will be shared
          with third parties or affiliates for marketing or promotional
          purposes.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Contact</h2>
        <p>
          Questions or data requests:{" "}
          <a
            href="mailto:hello@getreknock.com"
            className="font-semibold text-blue underline"
          >
            hello@getreknock.com
          </a>
        </p>
      </div>
      <Link href="/" className="mt-10 inline-block text-mist underline">
        ← Back to home
      </Link>
    </main>
  );
}
