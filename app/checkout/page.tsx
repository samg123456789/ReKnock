import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/lib/billing-actions";
import { PLANS, type PlanKey } from "@/lib/stripe";

export const metadata: Metadata = { title: "Start your $1 week - ReKnock" };

const FOUNDING_LIMIT = 20;

export default async function Checkout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Founding member is capped at the first 20 companies.
  const admin = createAdminClient();
  const { count } = await admin
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("plan", "founding");
  const foundingAvailable = (count ?? 0) < FOUNDING_LIMIT;

  const offered: PlanKey[] = foundingAvailable
    ? ["founding", "standard", "annual"]
    : ["standard", "annual"];

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col justify-center px-5 py-16">
      <p className="eyebrow mb-4">Almost there</p>
      <h1 className="display text-4xl md:text-5xl">Start your $1 week.</h1>
      <p className="mt-4 leading-relaxed text-slate">
        Your first week is a dollar. Pick your plan below. We charge $1 today,
        then your plan starts after 7 days. Cancel anytime.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        {offered.map((key) => {
          const plan = PLANS[key];
          return (
            <form key={key} action={createCheckoutSession.bind(null, key)}>
              <button
                type="submit"
                className="card flex w-full items-center justify-between p-6 text-left transition-colors hover:border-blue"
              >
                <span>
                  <span className="block text-lg font-semibold">{plan.label}</span>
                  <span className="block text-sm text-slate">{plan.blurb}</span>
                </span>
                <span className="rounded-xl bg-blue px-6 py-3 font-semibold text-white">
                  Choose
                </span>
              </button>
            </form>
          );
        })}
      </div>

      <p className="mt-6 text-center text-sm text-slate">
        Card required. $1 today, then billed after your first week.
      </p>
    </main>
  );
}
