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
  const [{ data: phone }, { data: campaigns }] = acting.companyId
    ? await Promise.all([
        acting.client.from("phone_numbers").select("status").eq("company_id", acting.companyId).maybeSingle(),
        acting.client.from("campaigns").select("id, name, is_default").eq("company_id", acting.companyId).order("is_default", { ascending: false }).order("created_at", { ascending: true }),
      ])
    : [{ data: null }, { data: [] }];

  return (
    <main className="app-bg">
      <div className="app-shell max-w-3xl">
        <AddQuoteForm numberLive={phone?.status === "active"} campaigns={(campaigns ?? []).map((c) => ({ id: c.id as string, name: c.name as string, isDefault: Boolean(c.is_default) }))} />
      </div>
    </main>
  );
}
