"use client";

// Friendly error boundary for the checkout segment. A failed Stripe call (or
// anything else) lands here with a retry, never a white error page.
export default function CheckoutError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-5 py-16 text-center">
      <p className="eyebrow mb-4">Hmm</p>
      <h1 className="display text-4xl md:text-5xl">We could not start checkout.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        Something hiccupped on our end and you were not charged. Give it another try.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-blue px-8 py-3.5 font-semibold text-white transition-colors hover:bg-blue-deep"
        >
          Try again
        </button>
        <a href="mailto:hello@getreknock.com?subject=Trouble starting checkout" className="text-sm text-slate underline">
          Still stuck? Email us and we will sort it out.
        </a>
      </div>
    </main>
  );
}
