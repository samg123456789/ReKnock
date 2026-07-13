"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { logAudit } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone";
import { scheduleSequence, computeStartAt } from "@/lib/enrollment";
import { DEFAULT_CAMPAIGN_STEPS, type CampaignStep } from "@/lib/campaign";
import { CSV_ROW_CAP } from "@/lib/csv";

export type CsvProspectRow = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  address: string;
  job_type: string;
  quote_amount: string;
  quote_date: string;
};

export type CsvImportResult = {
  ok: boolean;
  imported: number;
  skippedDuplicates: number;
  errors: Array<{ row: number; message: string }>;
};

function fail(message: string): CsvImportResult {
  return { ok: false, imported: 0, skippedDuplicates: 0, errors: [{ row: 0, message }] };
}

// Accepts YYYY-MM-DD or M/D/YYYY; anything else falls back to today.
function normalizeDate(raw: string): string {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const us = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) {
    const [, m, d, y] = us;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

// Bulk create prospects from a CSV upload. The client validates first for
// instant feedback; everything is re-checked here because the client is
// never trusted. Consent path is verbal_at_quote, confirmed by the required
// checkbox on the import screen.
export async function bulkCreateProspects(
  rows: CsvProspectRow[],
  enroll: boolean,
): Promise<CsvImportResult> {
  const acting = await getActingCompany();
  if (!acting) redirect("/login");
  if (!acting.companyId) return fail("No company found for your account.");
  const supabase = acting.client;
  const companyId = acting.companyId;

  if (!rows.length) return fail("Nothing to import.");
  if (rows.length > CSV_ROW_CAP)
    return fail(`That is more than ${CSV_ROW_CAP} rows. Split the file and import in batches.`);

  // Server-side validation pass. Row numbers are 1-based over the array the
  // client sent, so the client can map them back to lines in the file.
  const errors: Array<{ row: number; message: string }> = [];
  const seenPhones = new Set<string>();
  let skippedDuplicates = 0;

  type ValidRow = { row: number; data: CsvProspectRow; phone: string; quoteDate: string };
  const valid: ValidRow[] = [];

  rows.forEach((r, i) => {
    const rowNum = i + 1;
    const firstName = (r.first_name ?? "").trim();
    if (!firstName) {
      errors.push({ row: rowNum, message: "Missing first name." });
      return;
    }
    const phone = normalizePhone(r.phone ?? "");
    if (!phone) {
      errors.push({ row: rowNum, message: "Missing or invalid phone number." });
      return;
    }
    if (seenPhones.has(phone)) {
      skippedDuplicates++;
      return;
    }
    seenPhones.add(phone);
    valid.push({ row: rowNum, data: r, phone, quoteDate: normalizeDate(r.quote_date ?? "") });
  });

  if (!valid.length)
    return { ok: true, imported: 0, skippedDuplicates, errors };

  // Skip anyone already in this company's prospects (matched by phone).
  const { data: existing, error: existErr } = await supabase
    .from("prospects")
    .select("phone_e164")
    .eq("company_id", companyId)
    .in("phone_e164", valid.map((v) => v.phone));
  if (existErr) return fail("Could not check for existing customers. Please try again.");
  const existingPhones = new Set((existing ?? []).map((p) => p.phone_e164));

  const fresh = valid.filter((v) => {
    if (existingPhones.has(v.phone)) {
      skippedDuplicates++;
      return false;
    }
    return true;
  });

  if (!fresh.length)
    return { ok: true, imported: 0, skippedDuplicates, errors };

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, steps")
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();
  const steps = ((campaign?.steps as CampaignStep[] | null) ?? []).length
    ? (campaign!.steps as CampaignStep[])
    : DEFAULT_CAMPAIGN_STEPS;

  const now = new Date().toISOString();
  const inserts = fresh.map((v) => ({
    company_id: companyId,
    first_name: v.data.first_name.trim(),
    last_name: (v.data.last_name ?? "").trim() || null,
    phone_e164: v.phone,
    email: (v.data.email ?? "").trim().toLowerCase() || null,
    address: (v.data.address ?? "").trim() || null,
    job_type: (v.data.job_type ?? "").trim() || null,
    quote_amount: (() => {
      const n = Number((v.data.quote_amount ?? "").replace(/[^0-9.]/g, ""));
      return n > 0 ? n : null;
    })(),
    quote_date: v.quoteDate,
    status: enroll ? "sequencing" : "new",
    campaign_id: campaign?.id ?? null,
    source: "manual",
    consent_path: "verbal_at_quote",
    consent_captured_at: now,
  }));

  const { data: created, error: insertErr } = await supabase
    .from("prospects")
    .insert(inserts)
    .select("id, quote_date");
  if (insertErr || !created)
    return fail("Could not save the customers. Nothing was imported. Please try again.");

  // Enroll each new prospect in the default sequence. Batched in chunks of 10
  // so 200 rows do not fire 200 concurrent inserts. A scheduling hiccup never
  // fails the import; it lands in failed_jobs for review.
  let enrolled = 0;
  if (enroll) {
    const testMode = process.env.VERCEL_ENV !== "production";
    // Bulk imports start on the recommended cadence (first touch in ~2 days,
    // morning slot); individual timelines stay fully editable afterwards.
    const [{ data: co }, { data: windows }] = await Promise.all([
      supabase.from("companies").select("timezone").eq("id", companyId).maybeSingle(),
      supabase.from("sending_windows").select("day_of_week, start_time, end_time, enabled").eq("company_id", companyId),
    ]);
    const startAt = computeStartAt({
      choice: "recommended",
      tz: co?.timezone ?? "America/New_York",
      windows: windows ?? [],
      testMode,
    });
    for (let i = 0; i < created.length; i += 10) {
      const chunk = created.slice(i, i + 10);
      await Promise.all(
        chunk.map((p) =>
          scheduleSequence({
            companyId,
            prospectId: p.id,
            steps,
            startAt,
            testMode,
          })
            .then(() => {
              enrolled++;
            })
            .catch(() =>
              supabase.from("failed_jobs").insert({
                company_id: companyId,
                job_type: "sequence_enroll",
                payload: { prospect_id: p.id, source: "csv_import" },
                error: "scheduleSequence failed",
              }),
            ),
        ),
      );
    }
  }

  await Promise.all([
    supabase.from("events").insert({
      company_id: companyId,
      type: "csv_import",
      payload: { imported: created.length, skipped_duplicates: skippedDuplicates, enrolled },
    }),
    acting.impersonating
      ? logAudit(acting.client, {
          actorUserId: acting.actorUserId,
          actorEmail: acting.actorEmail,
          action: "support_csv_import",
          targetCompanyId: companyId,
          metadata: { imported: created.length },
        })
      : Promise.resolve(),
  ]);

  revalidatePath("/app");
  revalidatePath("/inbox");
  return { ok: true, imported: created.length, skippedDuplicates, errors };
}
