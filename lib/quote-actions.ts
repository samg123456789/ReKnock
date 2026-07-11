"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ScheduledTouch = { step: number; dayOffset: number; date: string };
export type CreatedQuote = { prospectId: string; firstName: string; touches: ScheduledTouch[] };

// Best-effort US phone normalization to E.164. We never guess a number we
// were not given; this only formats what the contractor typed.
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}

async function requireCompany() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: company } = await supabase.from("companies").select("id").single();
  if (!company) throw new Error("No company for current user");
  return { supabase, company };
}

export async function createManualQuote(input: {
  first_name: string;
  last_name: string;
  phone: string;
  job_type: string;
  quote_amount: string;
}): Promise<ActionResult<CreatedQuote>> {
  const firstName = input.first_name.trim();
  if (!firstName) return { ok: false, error: "Please enter the customer's first name." };

  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "Please enter a valid US phone number." };

  const amount = input.quote_amount.replace(/[^0-9.]/g, "");
  const quoteAmount = amount ? Number(amount) : null;

  const { supabase, company } = await requireCompany();

  // Default campaign drives the schedule preview (days 2/5/10/20).
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, steps")
    .eq("company_id", company.id)
    .eq("is_default", true)
    .maybeSingle();

  const today = new Date();
  const quoteDate = today.toISOString().slice(0, 10);

  const { data: prospect, error } = await supabase
    .from("prospects")
    .insert({
      company_id: company.id,
      first_name: firstName,
      last_name: input.last_name.trim() || null,
      phone_e164: phone,
      job_type: input.job_type.trim() || null,
      quote_amount: quoteAmount,
      quote_date: quoteDate,
      status: "sequencing",
      campaign_id: campaign?.id ?? null,
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !prospect) return { ok: false, error: "Could not save the quote. Please try again." };

  await supabase.from("events").insert({
    company_id: company.id,
    type: "prospect_created",
    payload: { prospect_id: prospect.id, source: "manual" },
  });

  const steps = (campaign?.steps as { day_offset: number }[] | null) ?? [
    { day_offset: 2 },
    { day_offset: 5 },
    { day_offset: 10 },
    { day_offset: 20 },
  ];
  const touches: ScheduledTouch[] = steps.map((s, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + s.day_offset);
    return { step: i + 1, dayOffset: s.day_offset, date: d.toISOString().slice(0, 10) };
  });

  return { ok: true, data: { prospectId: prospect.id, firstName, touches } };
}
