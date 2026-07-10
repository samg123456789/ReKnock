import type { Metadata } from "next";

export const metadata: Metadata = { title: "Check your email - ReKnock" };

export default function CheckEmail() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Login link sent</p>
      <h1 className="display text-4xl md:text-5xl">Check your email.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        We sent you a one-time login link. Click it and you are in.
      </p>
    </main>
  );
}
