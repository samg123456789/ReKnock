import type { Metadata } from "next";
import SignupForm from "@/components/auth/SignupForm";
import WaitlistForm from "@/components/WaitlistForm";

export const metadata: Metadata = { title: "Create your account - ReKnock" };

export default function Signup() {
  const isProduction = process.env.VERCEL_ENV === "production";

  if (!isProduction) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
        <p className="eyebrow mb-4">Dev access</p>
        <h1 className="display text-4xl md:text-5xl">Create your account.</h1>
        <p className="mt-4 leading-relaxed text-slate">
          Use a real inbox so you can confirm your email, test checkout, and run the full onboarding flow.
        </p>
        <SignupForm testMode />
        <p className="mt-5 text-center text-sm text-mist">
          Already have an account? <a href="/login" className="font-semibold text-blue underline">Log in</a>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Access is opening soon</p>
      <h1 className="display text-4xl md:text-5xl">Join the ReKnock waitlist.</h1>
      <p className="mt-4 leading-relaxed text-slate">We&apos;re opening ReKnock in small groups. Tell us about your quote workflow and we&apos;ll use that to decide who gets the next invite.</p>
      <div className="mt-8"><WaitlistForm source="signup" /></div>
      <p className="mt-5 text-center text-sm text-mist">
        Already have an account? <a href="/login" className="font-semibold text-blue underline">Log in</a>
      </p>
    </main>
  );
}
