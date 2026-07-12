import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email - ReKnock" };

function MailIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  );
}

export default async function CheckEmail({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-5 py-16">
      <div className="card w-full max-w-md p-8 text-center md:p-10">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sky text-blue">
          <MailIcon />
        </span>
        <p className="eyebrow mt-6">Login link sent</p>
        <h1 className="display mt-3 text-4xl">Check your email</h1>
        <p className="mt-4 leading-relaxed text-slate">
          We sent a one-time login link to{" "}
          {email ? <span className="font-semibold text-ink">{email}</span> : "your inbox"}.
          Tap it and you are in. No password needed.
        </p>

        <p className="mt-6 border-t border-sky-line pt-5 text-sm text-slate">
          Nothing yet? Give it a minute and check your spam folder.
        </p>
        <p className="mt-2 text-sm text-slate">
          Wrong email?{" "}
          <Link href="/login" className="font-semibold text-blue underline">
            Start over
          </Link>
        </p>
      </div>
    </main>
  );
}
