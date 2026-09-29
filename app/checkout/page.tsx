import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { foundingStatus } from "@/lib/founding";
import CheckoutPlan from "@/components/checkout/CheckoutPlan";

export const metadata: Metadata = { title: "Start your $1 week - ReKnock" };

export default async function Checkout({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { available, spotsLeft } = await foundingStatus();
  const { checkout } = await searchParams;

  return (
    <main className="mx-auto min-h-[calc(100vh-5.5rem)] px-5 py-8">
      {checkout === "cancelled" ? (
        <p className="mx-auto mb-8 max-w-lg rounded-xl bg-sky px-4 py-3 text-center text-sm text-blue-ink">
          No worries, nothing was charged. Pick a billing option below when you are ready.
        </p>
      ) : null}
      <CheckoutPlan available={available} spotsLeft={spotsLeft} />
    </main>
  );
}
