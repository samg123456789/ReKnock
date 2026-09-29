"use server";

import { createAdminClient } from "@/lib/supabase/server";

export type WaitlistState = { ok: boolean; error?: string };

export async function joinWaitlist(_prev: WaitlistState | undefined, formData: FormData): Promise<WaitlistState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  if (!emailPattern.test(email)) return { ok: false, error: "Enter a valid email address." };
  if (!fullName) return { ok: false, error: "Tell us who we should put on the list." };

  const admin = createAdminClient();
  const entry = {
    email,
    full_name: fullName,
    trade: String(formData.get("trade") ?? "").trim() || null,
    team_size: String(formData.get("team_size") ?? "").trim() || null,
    monthly_quotes: String(formData.get("monthly_quotes") ?? "").trim() || null,
    current_follow_up: String(formData.get("current_follow_up") ?? "").trim() || null,
    interested_plan: String(formData.get("interested_plan") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    source: String(formData.get("source") ?? "pricing").trim() || "pricing",
  };

  const { data: existing } = await admin
    .from("waitlist_signups")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  const { error } = existing
    ? await admin.from("waitlist_signups").update(entry).eq("id", existing.id)
    : await admin.from("waitlist_signups").insert(entry);

  if (error) return { ok: false, error: "We could not save that yet. Please try again." };
  return { ok: true };
}
