import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Log in - ReKnock" };

export default function Login() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Log in</p>
      <h1 className="display text-5xl">Welcome back.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        Customer dashboards are rolling out with our first accounts. If you're
        an early customer, your login link arrives by text - or email{" "}
        <a href="mailto:hello@getreknock.com" className="font-semibold text-blue underline">
          hello@getreknock.com
        </a>{" "}
        and the founder will sort you out personally.
      </p>
      <Link
        href="/signup"
        className="mt-8 inline-block rounded-xl bg-blue px-8 py-4 text-center text-lg font-semibold text-white hover:bg-blue-deep"
      >
        New here? Start for $1 →
      </Link>
      <Link href="/" className="mt-6 text-mist underline">← Back to home</Link>
    </main>
  );
}
