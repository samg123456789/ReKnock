import Link from "next/link";
import type { Metadata } from "next";
import { CONSENT_ATTESTATION_SINGLE } from "@/lib/consent";
import SmsExchangeGallery from "@/components/SmsExchangeGallery";

/* ============================================================================
   /sms-terms - public program and consent page for the 10DLC campaign.

   Twilio rejected the earlier campaign because reviewers could not verify the
   call-to-action for the listed opt-in paths. This page intentionally describes
   the contractor workflow, the hardcoded first-message disclosure, and the
   consent boundary that must be satisfied before a prospect is enrolled.
   ========================================================================== */

export const metadata: Metadata = {
  title: "Text message program & consent - ReKnock",
  description:
    "How ReKnock's quote follow-up texting program works: consent, first-message disclosures, message frequency, message and data rates, STOP, and HELP.",
  alternates: { canonical: "https://getreknock.com/sms-terms" },
};

const FIRST_MESSAGE =
  "Hi [Homeowner], it's [Contractor] with [Business] through ReKnock, following up on the [job] quote we discussed. Any questions I can answer?\n\nMessage and data rates may apply.\nReply STOP to unsubscribe.";

export default function SmsTerms() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <p className="eyebrow mb-4">ReKnock</p>
      <h1 className="display text-3xl sm:text-4xl md:text-5xl">Text message program &amp; consent</h1>

      <div className="mt-8 space-y-7 leading-relaxed text-slate">
        <p className="font-mono text-sm text-mist">Last updated: August 2026</p>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">What this program is</h2>
          <p>
            ReKnock sends quote follow-up text messages on behalf of the
            contractor who gave a homeowner an estimate, such as a roofer,
            painter, landscaper, fence company, or similar residential trade.
            The messages are about the homeowner&apos;s own requested quote only.
            They are not cold outreach, third-party offers, purchased-list
            marketing, or unrelated promotions.
          </p>
          <p>
            Message frequency varies by contractor. ReKnock provides recommended
            timing, but contractors can customize their sequence. A typical quote
            follow-up is 1 to 4 text messages over about 20 days. Automated
            follow-ups stop as soon as the homeowner replies. ReKnock also blocks
            more than 7 unanswered outbound follow-up messages to the same contact
            within any rolling 7-day period.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">How contractors use ReKnock</h2>
          <p>
            Contractors receive inquiries through their normal channels, such
            as a website form, Facebook, referrals, phone calls, or direct
            messages. When the conversation slows down or a reply is still
            pending, they add the inquiry to ReKnock and choose the follow-up
            plan.
          </p>
          <p>
            ReKnock then sends the follow-up from the contractor&apos;s texting
            number and in the contractor&apos;s voice. A contact may be enrolled
            only when the contractor has permission to send quote-related text
            messages. A phone number alone is not SMS consent.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">The first message includes a required disclosure</h2>
          <p>
            Every new prospect receives the contractor&apos;s message first. ReKnock
            then adds the following hardcoded disclosure on separate lines. It
            cannot be edited or removed by the contractor.
          </p>
          <div className="whitespace-pre-line rounded-lg bg-sky/60 px-4 py-3 font-mono text-sm text-ink">
            {"Message and data rates may apply.\nReply STOP to unsubscribe."}
          </div>
          <p className="text-sm text-mist">
            The rate disclosure is added automatically to the first outbound
            message. The STOP instruction remains on every homeowner-facing
            message so the recipient can unsubscribe at any time. This does not
            replace the requirement that the contact already agreed to receive
            texts.
          </p>
          <SmsExchangeGallery />
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">Proof inside ReKnock</h2>
          <p>
            Before a contractor can start follow-ups for a homeowner, ReKnock
            shows an unchecked consent attestation. The contractor must actively
            check it before the quote can be saved and enrolled.
          </p>
          <div className="rounded-lg border border-sky-line bg-white p-5 shadow-sm">
            <p className="mb-3 font-mono text-xs uppercase text-blue">Add quote confirmation</p>
            <div className="rounded-lg border border-slate/20 bg-sky/40 p-4">
              <label className="flex gap-3 text-sm text-ink">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate/40 bg-white" />
                <span>{CONSENT_ATTESTATION_SINGLE}</span>
              </label>
              <span className="mt-4 inline-flex rounded-lg bg-blue px-4 py-2 text-sm font-semibold text-white">
                Start chasing this quote
              </span>
            </div>
            <p className="mt-3 text-sm text-mist">
              The consent attestation version and capture time are stored with
              the prospect record for compliance review.
            </p>
          </div>
          <img
            src="/compliance/consent-checkbox-mockup.svg"
            alt="Mockup of the unchecked ReKnock consent confirmation shown before follow-up texts can start"
            className="mt-4 w-full rounded-lg border border-sky-line bg-white shadow-sm"
          />
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">First message example</h2>
          <p>
            The first text identifies the contractor and business, references
            the quote, and includes the required rate and unsubscribe disclosure.
          </p>
          <p className="whitespace-pre-line rounded-lg bg-sky/60 px-4 py-3 font-mono text-sm text-ink">
            {FIRST_MESSAGE}
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">Allowed and not allowed</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="font-semibold text-green-800">Allowed</p>
              <p className="mt-2 text-sm text-green-900">
                A homeowner asks Apex Roofing for a roof estimate, gives Mike
                their mobile number, and agrees Mike can text quote follow-ups.
                Mike enters that quote into ReKnock.
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="font-semibold text-red-800">Not allowed</p>
              <p className="mt-2 text-sm text-red-900">
                A contractor uploads purchased leads, scraped numbers, a trade
                show list, or people who never asked that contractor for a
                quote. ReKnock may not be used for that.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">Message frequency</h2>
          <p>
            Message frequency varies by contractor. ReKnock provides recommended
            timing, but contractors can customize their sequence. A typical quote
            follow-up is 1 to 4 text messages over about 20 days. Automated
            follow-ups stop as soon as the homeowner replies. ReKnock also blocks
            more than 7 unanswered outbound follow-up messages to the same
            contact within any rolling 7-day period.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">Opting out and getting help</h2>
          <p>
            Reply <strong className="text-ink">STOP</strong> to opt out. Reply{" "}
            <strong className="text-ink">HELP</strong> for help. Message and
            data rates may apply.
          </p>
          <p className="rounded-lg bg-sky/60 px-4 py-3 font-mono text-sm text-ink">
            You have successfully been unsubscribed. You will not receive any more
            messages from this number. Reply START to resubscribe.
          </p>
          <p className="rounded-lg bg-sky/60 px-4 py-3 font-mono text-sm text-ink">
            ReKnock quote follow-ups on behalf of your contractor. Reply STOP to
            unsubscribe. Message and data rates may apply.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">Privacy and mobile information</h2>
          <p>
            <strong className="text-ink">
              No mobile information will be shared with third parties or affiliates
              for marketing or promotional purposes.
            </strong>{" "}
            Text messaging originator opt-in data and consent are not shared with
            anyone for marketing. ReKnock shares information only with service
            providers needed to deliver and operate the quote follow-up service.
          </p>
          <p>
            Full details are in our{" "}
            <Link href="/privacy" className="text-blue underline">
              Privacy &amp; texting policy
            </Link>{" "}
            and{" "}
            <Link href="/terms" className="text-blue underline">
              Terms &amp; Conditions
            </Link>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="display text-2xl text-ink">Contact</h2>
          <p>
            Questions about the texting program or a data request:{" "}
            <a href="mailto:hello@getreknock.com" className="font-semibold text-blue underline">
              hello@getreknock.com
            </a>
          </p>
        </section>
      </div>

      <Link href="/" className="mt-10 inline-block text-mist underline">
        Back to home
      </Link>
    </main>
  );
}
