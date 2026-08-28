import type { Metadata } from "next";

export const metadata: Metadata = { title: "Join the waitlist - ReKnock" };

export default function Signup() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Access is opening soon</p>
      <h1 className="display text-4xl md:text-5xl">Join the ReKnock waitlist.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        We&apos;re pausing new accounts while we prepare the next group of
        contractors. Leave us a note and we&apos;ll let you know when access opens.
      </p>
      <a href="mailto:hello@getreknock.com?subject=ReKnock waitlist&body=I%27m interested in ReKnock. My trade and team size: " className="mt-8 rounded-xl bg-blue px-6 py-3.5 text-center font-semibold text-white shadow-pop transition-colors hover:bg-blue-deep">
        Join the waitlist →
      </a>
      <p className="mt-5 text-center text-sm text-mist">
        Already have an account? <a href="/login" className="font-semibold text-blue underline">Log in</a>
      </p>
    </main>
  );
}
