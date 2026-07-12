import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CsvImport from "@/components/app/CsvImport";

export const metadata: Metadata = { title: "Import quotes - ReKnock" };

export default async function ImportQuotes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <CsvImport />
    </main>
  );
}
