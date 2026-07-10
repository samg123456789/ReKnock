import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email - ReKnock" };

export default function CheckEmail() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">One more step</p>
      <h1 className="display text-4xl md:text-5xl">Check your email.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        We sent you a confirmation link. Click it to verify your email, then we
        will take you to set up your billing and your account.
      </p>
      <p className="mt-4 text-sm text-slate">
        Did not get it? Check spam, or{" "}
        <Link href="/signup" className="font-semibold text-blue underline">
          try again
        </Link>
        .
      </p>
    </main>
  );
}
