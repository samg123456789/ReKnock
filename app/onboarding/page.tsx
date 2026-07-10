import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Set up your account - ReKnock" };

// Stub. The real onboarding wizard is Phase 2. For now this is where a paid,
// not-yet-onboarded user lands so Phase 1 acceptance ("lands on onboarding
// step 1") has a target.
export default async function Onboarding() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Step 1 of 7</p>
      <h1 className="display text-4xl md:text-5xl">You are paid up. Let us set you up.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        This is where onboarding begins: your company, your voice, your texting
        line. The full wizard is coming next. For now, payment worked and you are
        in the right place.
      </p>
    </main>
  );
}
