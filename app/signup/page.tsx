import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Start for $1 - ReKnock" };

export default function Signup() {
  const testMode = process.env.VERCEL_ENV !== "production";
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Start for $1</p>
      <h1 className="display text-4xl md:text-5xl">Create your account.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        Your first week is a dollar. We set up your texting line, your voice, and
        your follow-ups in about ten minutes.
      </p>
      {testMode ? <p className="mt-3 rounded-lg bg-sky px-3 py-2 text-xs font-semibold text-blue-ink">Preview test mode: this account is excluded from founding-customer counts.</p> : null}
      <SignupForm testMode={testMode} />
    </main>
  );
}
