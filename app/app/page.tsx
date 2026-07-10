import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/supabase/auth-actions";

// Stub dashboard. Replaced by the real app shell (inbox, Phase 6). For now it
// confirms auth works end to end and gives a way to sign out.
export default async function AppHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">You are in</p>
      <h1 className="display text-4xl md:text-5xl">Signed in as {user.email}.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        Billing and onboarding land here next. This is a placeholder so we can
        prove sign-up, confirmation, and login all work.
      </p>
      <form action={signOut} className="mt-8">
        <button
          type="submit"
          className="rounded-xl border border-slate/20 px-6 py-3 font-semibold text-slate transition-colors hover:border-blue hover:text-blue"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
