import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import AddQuoteForm from "@/components/app/AddQuoteForm";

export const metadata: Metadata = { title: "Add a quote - ReKnock" };

export default async function NewQuote() {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");

  // The confirmation screen's "sends begin once your number activates" note
  // must only appear when that is actually true.
  const { data: phone } = acting.companyId
    ? await acting.client.from("phone_numbers").select("status").eq("company_id", acting.companyId).maybeSingle()
    : { data: null };

  return (
    <main className="mx-auto max-w-lg px-5 py-12">
      <AddQuoteForm numberLive={phone?.status === "active"} />
    </main>
  );
}
