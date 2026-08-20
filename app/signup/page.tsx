import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";

export const metadata: Metadata = { title: "Start for $1 - ReKnock" };

export default function Signup() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Start for $1</p>
      <h1 className="display text-4xl md:text-5xl">Create your account.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        Your first week is a dollar. We set up your texting line, your voice, and
        your follow-ups in about ten minutes.
      </p>
      <SignupForm />
    </main>
  );
}
