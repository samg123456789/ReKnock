import Link from "next/link";
import type { Metadata } from "next";

/* Plain-English privacy + SMS policy. Exists partly because the 10DLC
   campaign review checks the site for opt-in/opt-out disclosure, message
   frequency, msg&data-rates, and a no-third-party-sharing statement for
   mobile data. Not legal advice - have a professional review before scale. */

export const metadata: Metadata = {
  title: "Privacy & texting policy - ReKnock",
  description:
    "How ReKnock handles your information and text messages. We never sell or share mobile information with third parties for marketing.",
  alternates: { canonical: "https://getreknock.com/privacy" },
};

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="eyebrow mb-4">ReKnock</p>
      <h1 className="display text-5xl">Privacy &amp; texting policy</h1>
      <div className="mt-8 space-y-6 leading-relaxed text-slate">
        <p className="font-mono text-sm text-mist">Last updated: July 2026</p>

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
          when requesting an estimate and agreed to be contacted about it. How
          consent is collected and the exact opt-in wording are described on our{" "}
          <Link href="/sms-terms" className="text-blue underline">
            text message program &amp; consent
          </Link>{" "}
          page.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Message frequency</h2>
        <p>
          Message frequency varies. A typical quote follow-up is about four
          messages over three weeks, and it stops the moment you reply.{" "}
          <strong className="text-ink">Message and data rates may apply.</strong>
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Opting out</h2>
        <p>
          Reply <strong className="text-ink">STOP</strong> to any message to opt
          out permanently. Reply <strong className="text-ink">HELP</strong> for
          help. Opting out of one contractor&apos;s messages stops all ReKnock
          messages from that contractor.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">
          Mobile information and third parties
        </h2>
        <p>
          We do not sell your personal information.{" "}
          <strong className="text-ink">
            No mobile information will be shared with third parties or affiliates
            for marketing or promotional purposes.
          </strong>{" "}
          Text messaging originator opt-in data and consent are never shared with
          any third parties. We share information only with the service providers
          needed to deliver the messages (for example, our SMS carrier) and only
          for that purpose.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">What we store</h2>
        <p>
          We store the information needed to run follow-ups: names, phone
          numbers, quote details, message history, and consent records with the
          date and source of consent.
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

        <p className="pt-2 text-sm text-mist">
          See also our{" "}
          <Link href="/sms-terms" className="text-blue underline">
            text message program &amp; consent
          </Link>{" "}
          page and our{" "}
          <Link href="/terms" className="text-blue underline">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </div>
      <Link href="/" className="mt-10 inline-block text-mist underline">
        ← Back to home
      </Link>
    </main>
  );
}
