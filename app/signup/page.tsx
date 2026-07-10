import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Start for $1 - ReKnock" };

const TALLY_FORM_URL = "https://tally.so/r/KYyEjV";

export default function Signup() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Early access</p>
      <h1 className="display text-5xl md:text-6xl">Onboarding the first contractors by hand.</h1>
      <p className="mt-6 text-lg leading-relaxed text-slate">I am Sam, and ReKnock is brand new. I set up every account personally: your voice, your trade, your first quotes, done with you in about ten minutes. Your first week is a dollar.</p>
      <div className="card mt-8 p-6 text-center">
        <a href={TALLY_FORM_URL} target="_blank" rel="noopener noreferrer" className="inline-block rounded-xl bg-blue px-8 py-4 text-lg font-semibold text-white transition-colors hover:bg-blue-deep">Grab a founding spot</a>
        <p className="mt-4 text-sm text-slate">Prefer email? Reach me at <a href="mailto:hello@getreknock.com" className="font-semibold text-blue underline">hello@getreknock.com</a></p>
      </div>
      <Link href="/" className="mt-10 text-mist underline">Back to home</Link>
    </main>
  );
}
