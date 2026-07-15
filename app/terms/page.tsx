import Link from "next/link";
import type { Metadata } from "next";

/* Terms & Conditions. Referenced from the 10DLC campaign registration, so it
   must be live on the production domain. Not legal advice - have a professional
   review before scale. */

export const metadata: Metadata = {
  title: "Terms & Conditions - ReKnock",
  description:
    "The terms for using ReKnock, including our SMS follow-up program, billing, and acceptable use.",
  alternates: { canonical: "https://getreknock.com/terms" },
};

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="eyebrow mb-4">ReKnock</p>
      <h1 className="display text-5xl">Terms &amp; Conditions</h1>
      <div className="mt-8 space-y-6 leading-relaxed text-slate">
        <p className="font-mono text-sm text-mist">Last updated: July 2026</p>

        <p>
          These terms govern your use of ReKnock (&quot;ReKnock,&quot;
          &quot;we,&quot; &quot;us&quot;), operated from getreknock.com. By
          creating an account or using the service, you agree to them.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">The service</h2>
        <p>
          ReKnock helps contractors follow up on quotes by sending automated text
          messages to the homeowners they quoted, and by relaying the
          homeowner&apos;s replies back to the contractor. Follow-ups are sent
          from a dedicated texting number and stop as soon as the homeowner
          replies.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">SMS program terms</h2>
        <p>
          By providing a mobile number, you agree to receive text messages
          related to your quote. Message frequency varies (a typical follow-up is
          about four messages over three weeks per quote).{" "}
          <strong className="text-ink">Message and data rates may apply.</strong>{" "}
          Reply <strong className="text-ink">STOP</strong> to opt out at any time
          and <strong className="text-ink">HELP</strong> for help. Carriers are
          not liable for delayed or undelivered messages. How consent is
          collected and the exact opt-in wording are described on our{" "}
          <Link href="/sms-terms" className="text-blue underline">
            text message program &amp; consent
          </Link>{" "}
          page, and how we handle this data is described in our{" "}
          <Link href="/privacy" className="text-blue underline">
            Privacy &amp; texting policy
          </Link>
          , including that mobile information is never shared with third parties
          for marketing.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">
          Contractor responsibilities
        </h2>
        <p>
          If you use ReKnock to text your customers, you confirm that each person
          you add gave you their number and agreed to be contacted about their
          quote. You are responsible for the content you approve and for
          complying with applicable messaging laws (including the TCPA). Do not
          use ReKnock for marketing blasts, purchased lists, or anyone who has
          not asked you for a quote.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Billing</h2>
        <p>
          ReKnock starts with a $1 first week, then bills at your selected plan
          rate. Billing is handled by Stripe. You can cancel anytime from the
          billing portal; cancellation stops future charges and ends automated
          sending.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Acceptable use</h2>
        <p>
          Do not use ReKnock to send unlawful, deceptive, harassing, or unsolicited
          messages. We may suspend accounts that put our messaging reputation or
          other customers at risk.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Disclaimer</h2>
        <p>
          ReKnock is provided &quot;as is.&quot; We work hard to deliver messages
          reliably but cannot guarantee delivery, carrier behavior, or specific
          business results. To the extent allowed by law, our liability is limited
          to the amount you paid us in the prior three months.
        </p>

        <h2 className="display pt-2 text-2xl text-ink">Contact</h2>
        <p>
          Questions about these terms:{" "}
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
