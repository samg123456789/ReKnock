"use server";

import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { logAudit } from "@/lib/admin";

export type SettingsResult = { ok: true } | { ok: false; error: string };

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return null;
}

async function acting() {
  const a = await getActingCompany();
  if (!a) redirect("/login");
  if (!a.companyId) throw new Error("No company");
  return a;
}

// The cell we text when a homeowner replies (reply relay).
export async function setRelayCell(cell: string): Promise<SettingsResult> {
  const phone = normalizePhone(cell);
  if (!phone) return { ok: false, error: "Enter a valid US mobile number." };
  const a = await acting();
  const { error } = await a.client.from("users").update({ cell_phone: phone }).eq("company_id", a.companyId!);
  if (error) return { ok: false, error: "Could not save." };
  if (a.impersonating) {
    await logAudit(a.client, { actorUserId: a.actorUserId, actorEmail: a.actorEmail, action: "support_set_relay_cell", targetCompanyId: a.companyId, metadata: {} });
  }
  return { ok: true };
}

// "Notify me" on a coming-soon feature; the demand signal (CLAUDE.md Phase 7).
export async function logFeatureInterest(feature: string): Promise<SettingsResult> {
  const a = await acting();
  await a.client.from("events").insert({ company_id: a.companyId, type: "feature_interest", payload: { feature } });
  return { ok: true };
}
