import type { Metadata } from "next";

export const metadata: Metadata = { title: "Account paused - ReKnock" };

export default function Suspended() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16 text-center">
      <p className="eyebrow mb-4">Account paused</p>
      <h1 className="display text-3xl md:text-4xl">Your account is on hold.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        Follow-ups are paused for now. Reach out and we&apos;ll get you back up and running.
      </p>
      <a href="mailto:hello@getreknock.com" className="mt-6 font-semibold text-blue underline">
        hello@getreknock.com
      </a>
    </main>
  );
}
