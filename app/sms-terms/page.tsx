import Link from "next/link";
import type { Metadata } from "next";

/* ============================================================================
   /sms-terms - public opt-in (CTA) verification page for the 10DLC campaign.

   WHY THIS PAGE EXISTS: Twilio rejected the A2P campaign with error 30909
   (CTA / opt-in could not be verified) because ReKnock's consent is collected
   at the point of quote (the homeowner gives their number to the contractor),
   so there was no public URL a reviewer could open to see the opt-in language.
   This page is that URL: it states the program, both opt-in paths, and every
   required disclosure (frequency, msg & data rates, STOP/HELP), and links to
   Privacy and Terms. Point this campaign's opt-in / message-flow URL here.

   >>> LEGAL REVIEW PENDING (founder, before resubmit) <<<
   The consent / call-to-action wording below (see CONSENT_LANGUAGE and the
   "How you opt in" section) is a DRAFT written for review, NOT final language.
   Do not resubmit the 10DLC campaign against this copy until Sam's legal
   review signs off on the exact wording. Everything else on the page (the
   disclosures, STOP/HELP strings, structure) reflects already-registered
   behavior. This lives on dev only until the founder merges to main.
   ========================================================================== */

export const metadata: Metadata = {
  title: "Text message program & consent - ReKnock",
  description:
    "How ReKnock's quote follow-up texting program works: how you opt in, message frequency, message and data rates, and how to opt out with STOP or get help with HELP.",
  alternates: { canonical: "https://getreknock.com/sms-terms" },
};

/* DRAFT - pending legal review. The exact words a homeowner sees or is told
   at the point they give a contractor their number. */
const CONSENT_LANGUAGE =
  "I agree that [Contractor business name] may send me text messages about my quote or estimate through ReKnock, their texting provider. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.";

export default function SmsTerms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="eyebrow mb-4">ReKnock</p>
      <h1 className="display text-3xl sm:text-4xl md:text-5xl">Text message program &amp; consent</h1>

      <div className="mt-8 space-y-6 leading-relaxed text-slate">
        <p className="font-mono text-sm text-mist">Last updated: July 2026</p>

        <h2 className="display pt-2 text-2xl text-ink">What this program is</h2>
        <p>
          ReKnock sends quote follow-up text messages on behalf of the
          contractor who gave you an estimate (for example your roofer, painter,
          or fence company). Every message comes from that contractor&apos;s
          dedicated business number and is about your open quote only. It is
          never marketing, and it is never a third-party offer.
        </p>
        <p>
          A typical follow-up is a short, friendly check-in, and it stops the
          moment you reply. When you reply, you are talking to the contractor
          directly.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">How you opt in</h2>
        <p>
          You receive these texts because you asked a contractor for a quote and
          agreed to be contacted about it. When you request a quote in person or
          by phone, you give the contractor your mobile number and agree they
          can text you about your estimate. The contractor reads the agreement
          wording shown below and records your consent in ReKnock before any
          texts are scheduled.
        </p>
        <p>
          Consent is never bought, sold, or transferred. A contractor may only
          add you if you personally gave them your number for your own quote.
        </p>

        {/* DRAFT consent language - pending legal review before resubmit */}
        <div className="rounded-2xl border border-sky-line bg-sky/60 p-6">
          <p className="font-mono text-xs uppercase tracking-wide text-blue">
            The agreement you make when you opt in
          </p>
          <p className="mt-3 text-ink">&ldquo;{CONSENT_LANGUAGE}&rdquo;</p>
          <p className="mt-3 text-sm text-mist">
            The contractor&apos;s business name replaces the bracketed part.
          </p>
        </div>

        <h2 className="display pt-2 text-2xl text-ink">Message frequency</h2>
        <p>
          Message frequency varies. A typical quote follow-up is about four
          messages over three weeks, and it stops as soon as you reply.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">
          Message and data rates
        </h2>
        <p>
          <strong className="text-ink">
            Message and data rates may apply.
          </strong>{" "}
          Any charges come from your mobile carrier, based on your plan. ReKnock
          does not charge you, the homeowner, anything.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">
          Opting out and getting help
        </h2>
        <p>
          Reply <strong className="text-ink">STOP</strong> to any message to opt
          out permanently. You will get one confirmation and then no more
          messages:
        </p>
        <p className="rounded-xl bg-sky/60 px-4 py-3 font-mono text-sm text-ink">
          You have successfully been unsubscribed. You will not receive any more
          messages from this number. Reply START to resubscribe.
        </p>
        <p>
          Reply <strong className="text-ink">HELP</strong> for help at any time.
          You will receive:
        </p>
        <p className="rounded-xl bg-sky/60 px-4 py-3 font-mono text-sm text-ink">
          ReKnock quote follow-ups on behalf of your contractor. Reply STOP to
          unsubscribe. Msg &amp; Data Rates May Apply.
        </p>
        <p>
          Opting out of one contractor&apos;s messages stops all messages from
          that contractor, for every quote, permanently.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">
          Privacy and your mobile information
        </h2>
        <p>
          <strong className="text-ink">
            No mobile information will be shared with third parties or affiliates
            for marketing or promotional purposes.
          </strong>{" "}
          Text messaging originator opt-in data and consent are never shared with
          anyone. We share information only with the service providers needed to
          deliver the messages (such as our SMS carrier) and only for that
          purpose. Full details are in our{" "}
          <Link href="/privacy" className="text-blue underline">
            Privacy &amp; texting policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-blue underline">
            Terms &amp; Conditions
          </Link>
          .
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Contact</h2>
        <p>
          Questions about the texting program or a data request:{" "}
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
