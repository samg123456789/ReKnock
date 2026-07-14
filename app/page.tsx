import Link from "next/link";
import type { Metadata } from "next";
import PhoneThread from "@/components/PhoneThread";

export const metadata: Metadata = {
  title: "ReKnock - automatic follow-up texts for contractor quotes",
  description:
    "You quoted it, they went quiet. ReKnock texts homeowners after every quote - in your voice - and hands you the conversation the second they reply. For roofers, painters, fencing and every quoted trade. $1 first week.",
  alternates: { canonical: "https://getreknock.com" },
};

/* Flip to true only when real customer quotes exist (see docs/reknock-landing.md).
   Fabricated reviews are an FTC problem and contractors can smell them. */
const SHOW_TESTIMONIALS = false;

const placeholderTestimonials = [
  {
    stars: 5,
    quote: "REPLACE WITH REAL QUOTE FROM CONCIERGE CUSTOMER",
    name: "Name",
    biz: "Trade, City",
  },
  { stars: 5, quote: "REPLACE", name: "Name", biz: "Trade, City" },
  { stars: 5, quote: "REPLACE", name: "Name", biz: "Trade, City" },
];

function CTA({ label = "Start for $1 →", big = false }: { label?: string; big?: boolean }) {
  return (
    <Link
      href="/signup"
      className={`inline-block rounded-xl bg-blue font-semibold text-white shadow-pop transition-all hover:-translate-y-0.5 hover:bg-blue-deep ${big ? "px-9 py-4 text-lg" : "px-6 py-3 text-base"}`}
    >
      {label}
    </Link>
  );
}

const benefits = [
  {
    title: "Texts get read. Emails get buried.",
    body: "SMS gets seen in minutes, not days. Your follow-up lands on the homeowner's lock screen, from a local number, signed with your name.",
  },
  {
    title: "Your voice, not robot-speak.",
    body: "Pick your tone - friendly, professional, or straight-shooter - and approve every word once. From then on, every follow-up sounds like you wrote it at a red light, because effectively you did.",
  },
  {
    title: "It stops the second they reply.",
    body: "One reply freezes the sequence instantly and pings your phone. You answer like a normal text. No app to babysit, no lead left hanging.",
  },
  {
    title: "Proof it's working.",
    body: "A monthly tally: quotes chased, replies earned, jobs closed. You'll know exactly which $8,000 roof this $39 tool recovered.",
  },
];

const intake = [
  {
    label: "Forward it",
    body: "Forward the quote email (PDFs included) or text message to your ReKnock line. We pull the name, number, and amount, and text you back if anything's missing.",
  },
  {
    label: "Snap a photo",
    body: "Text a photo of the paper estimate or a screenshot of any chat, even Facebook Messenger, straight from the truck.",
  },
  {
    label: "Type it (10 seconds)",
    body: "Name, phone, amount, done. Built for thumbs, not office managers.",
  },
];

const integrations = [
  "Jobber", "Housecall Pro", "QuickBooks", "Zapier", "Joist", "Google Calendar",
  "Angi Leads", "Thumbtack", "ServiceTitan", "Invoice Simple",
];

const faqs = [
  {
    q: "Do homeowners know it's automated?",
    a: "The texts come from your dedicated business number and sound like you, because you approve every word before anything sends. When they reply, it IS you.",
  },
  {
    q: "What if someone tells me to stop texting?",
    a: "They reply STOP once and they're removed automatically, permanently. You stay on the right side of texting law without thinking about it.",
  },
  {
    q: "I use Jobber / Housecall Pro / QuickBooks.",
    a: "Keep them. ReKnock doesn't replace anything - log the quote in ReKnock (or connect via Zapier) and we handle just the chasing. Direct integrations are on the way.",
  },
  {
    q: "What trades does this work for?",
    a: "Any trade that sends a quote and waits: roofing, painting, fencing, decks, concrete, tree work, garage doors, landscaping. If homeowners ghost you, it works.",
  },
  {
    q: "How fast is setup?",
    a: "About 10 minutes: answer a few questions so the texts sound like you, approve your follow-ups, log your open quotes. Carriers then verify your dedicated number (an anti-spam step every legitimate business texting service goes through) - and your $1 week doesn't start until your line is live, so you never pay for waiting.",
  },
  {
    q: "What does the $1 trial include?",
    a: "A full week of the Starter plan: your dedicated number, your voice-matched sequences, and your first 50 follow-up texts. The week starts the day your number goes live. Card up front, cancel with one tap.",
  },
];

export default function Home() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "ReKnock",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description:
      "Automatic SMS follow-up for contractor quotes. Four polite texts over three weeks, in the contractor's voice, stopping instantly when the homeowner replies.",
    offers: { "@type": "Offer", price: "39", priceCurrency: "USD" },
    url: "https://getreknock.com",
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,#eef4ff_0%,transparent_70%)]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-16 pt-14 md:grid-cols-2 md:pb-24 md:pt-20">
          <div>
            <p className="eyebrow rise rise-1 mb-4">
              For roofers, painters, landscapers &amp; every quoted trade
            </p>
            <h1 className="display rise rise-1 text-6xl md:text-7xl">
              You quoted it.
              <br />
              Then&hellip; <span className="text-mist">nothing.</span>
            </h1>
            <p className="rise rise-2 mt-6 max-w-md text-lg leading-relaxed text-slate">
              ReKnock texts your homeowners after every quote - politely, in
              your own words - until they answer. The second they reply, it
              stops and hands the conversation to you.
            </p>
            <div className="rise rise-3 mt-8 flex flex-wrap items-center gap-4">
              <CTA big />
              <p className="font-mono text-sm text-mist">
                $1 first week · $29/mo founding rate{" "}
                <span className="text-mist/70 line-through">$39</span>
                <br />
                Cancel with one tap
              </p>
            </div>
          </div>
          <PhoneThread />
        </div>
      </section>

      {/* ================= BENEFITS / MESSAGING ================= */}
      <section className="border-y border-sky-line bg-sky/60">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <p className="eyebrow mb-3">Why texting wins</p>
          <h2 className="display max-w-2xl text-4xl md:text-5xl">
            The jobs go to the last contractor in the thread.
          </h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {benefits.map((b) => (
              <div key={b.title} className="card card-hover p-6">
                <h3 className="display text-2xl text-blue-ink">{b.title}</h3>
                <p className="mt-2 leading-relaxed text-slate">{b.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= HOW IT WORKS / INTAKE ================= */}
      <section id="how" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <p className="eyebrow mb-3">How it works</p>
          <h2 className="display text-4xl md:text-5xl">
            Get a quote in. We take it from there.
          </h2>
          <p className="mt-4 max-w-2xl text-lg text-slate">
            Three ways to log a quote - pick whichever fits the moment. Then
            ReKnock runs four polite texts over three weeks (day 2, 5, 10, 20)
            and freezes the instant your homeowner answers.
          </p>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {intake.map((s) => (
              <div key={s.label} className="card card-hover p-6">
                <p className="font-mono text-xs uppercase tracking-wide text-blue">
                  {s.label}
                </p>
                <p className="mt-3 leading-relaxed text-slate">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= MATH ================= */}
      <section className="bg-blue-ink text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:py-24">
          <div>
            <h2 className="display text-4xl md:text-5xl">
              One saved job pays for years of this.
            </h2>
            <p className="mt-5 max-w-md text-lg leading-relaxed text-white/75">
              Say you send 10 quotes a month and close 3. Following up 4 times
              instead of 0 doesn&apos;t need to work miracles - it just needs
              to turn <span className="font-semibold text-white">one</span>{" "}
              dead quote into a job.
            </p>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-white/75">
              One $4,000 fence. One $8,000 roof repair. That&apos;s the whole
              pitch.
            </p>
          </div>

          {/* receipt card - plan-agnostic, revenue framing */}
          <div className="mx-auto w-full max-w-sm rotate-1 rounded-lg bg-white p-7 text-ink shadow-overlay">
            <p className="text-center font-mono text-xs tracking-[0.2em] text-mist">
              ··· ONE QUOTE, TWO ENDINGS ···
            </p>
            <div className="mt-6 space-y-4 font-mono text-[15px]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate">Quote ghosted</span>
                <span className="flex-1 border-b border-dotted border-sky-line" />
                <span className="font-semibold text-mist">$0</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate">Quote re-knocked</span>
                <span className="flex-1 border-b border-dotted border-sky-line" />
                <span className="font-semibold">+$4,000</span>
              </div>
            </div>
            <div className="my-5 border-t-2 border-dashed border-sky-line" />
            <div className="flex items-baseline justify-between font-mono">
              <span className="font-semibold uppercase tracking-wide">
                New revenue
              </span>
              <span className="display text-4xl text-mint">+$4,000</span>
            </div>
            <p className="mt-5 text-center text-sm text-mist">
              One homeowner answering one follow-up covers years of ReKnock,
              whatever plan you pick. Your margins are your business - the
              revenue is new either way.
            </p>
          </div>
        </div>
      </section>

      {/* ================= INTEGRATIONS ================= */}
      <section id="integrations" className="scroll-mt-20 border-b border-sky-line">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-3">Integrations · coming soon</p>
              <h2 className="display text-4xl md:text-5xl">
                Keep your tools. We just do the chasing.
              </h2>
            </div>
            <p className="max-w-sm text-slate">
              Zapier connection at launch. Direct integrations rolling out to
              Growth plans - tell us which one you need first.
            </p>
          </div>
          <div className="mt-10 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
            <div className="marquee py-2">
              {[...integrations, ...integrations].map((name, i) => (
                <span
                  key={i}
                  className="whitespace-nowrap rounded-full border border-[#eef0f4] bg-[#f7f8fa] px-5 py-2 text-sm font-medium text-mist"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= TESTIMONIALS (hidden until real) ================= */}
      {SHOW_TESTIMONIALS && (
        <section className="bg-sky/60">
          <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
            <p className="eyebrow mb-3">From the trades</p>
            <h2 className="display text-4xl md:text-5xl">
              Contractors who stopped chasing.
            </h2>
            <div className="mt-12 grid gap-5 md:grid-cols-3">
              {placeholderTestimonials.map((t, i) => (
                <figure key={i} className="card p-6">
                  <div aria-label={`${t.stars} out of 5 stars`} className="text-amber">
                    {"★".repeat(t.stars)}
                  </div>
                  <blockquote className="mt-3 leading-relaxed text-slate">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="mt-4 text-sm font-semibold text-ink">
                    {t.name}
                    <span className="block font-normal text-mist">{t.biz}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= PRICING PREVIEW ================= */}
      <section className="bg-sky/60">
        <div className="mx-auto max-w-4xl px-5 py-16 text-center md:py-24">
          <h2 className="display text-4xl md:text-5xl">Try everything for $1.</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate">
            One week of everything for a dollar - your dedicated number,
            voice-matched follow-ups, 50 texts. Then $29/month, locked for
            life for our first 20 founding contractors (list price $39). No
            contracts, cancel with one tap.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <CTA big />
            <Link
              href="/pricing"
              className="rounded-xl border border-sky-line bg-white px-9 py-4 text-lg font-semibold text-blue transition-colors hover:border-blue"
            >
              Compare plans
            </Link>
          </div>
        </div>
      </section>

      {/* ================= FAQ ================= */}
      <section>
        <div className="mx-auto max-w-3xl px-5 py-16 md:py-24">
          <h2 className="display text-4xl md:text-5xl">Questions, answered.</h2>
          <div className="mt-10 divide-y divide-sky-line">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                  {f.q}
                  <span
                    aria-hidden
                    className="font-mono text-xl text-blue transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-slate">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FOOTER CTA ================= */}
      <section className="border-t border-sky-line">
        <div className="mx-auto max-w-3xl px-5 py-16 text-center md:py-24">
          <h2 className="display text-4xl md:text-6xl">
            Your next job is sitting in a quote you already sent.
          </h2>
          <div className="mt-8">
            <CTA big />
          </div>
          <p className="display mx-auto mt-8 max-w-2xl text-2xl text-slate md:text-3xl">
            Ten minutes to set up. First week costs a dollar.{" "}
            <span className="text-ink">The silence costs more.</span>
          </p>
        </div>
      </section>
    </main>
  );
}
