import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AddQuoteForm from "@/components/app/AddQuoteForm";

export const metadata: Metadata = { title: "Add a quote - ReKnock" };

export default async function NewQuote() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-lg px-5 py-12">
      <AddQuoteForm />
    </main>
  );
}
