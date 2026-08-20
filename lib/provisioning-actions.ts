"use server";

import { redirect } from "next/navigation";
import { getActingCompany } from "@/lib/acting-company";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { sendSms } from "@/lib/twilio";
import { logAudit } from "@/lib/admin";
import { notifyAdmin } from "@/lib/notify-admin";

// Phase 3: pick-your-ReKnock-number. Search available local numbers in an
// area code, one tap to claim. Claiming buys the number via Twilio and
// attaches it to our Messaging Service; the number sits in 'pending_10dlc'
// until carrier registration clears (an admin flips it to 'active', see
// OPERATIONS.md). Sends keep using the shared pool until then, so nothing
// breaks while carriers take their few days.
//
// Off production (or without ALLOW_NUMBER_PURCHASE=true) claiming is
// simulated: the row is written with tendlc_status.simulated=true and no
// money moves. companyFromNumber() only pins 'active' numbers, so a
// simulated row can never become a Twilio From and break sends.

export type AvailableNumber = { e164: string; friendly: string; locality: string | null; region: string | null };
export type ProvisionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

async function acting() {
  const a = await getActingCompany();
  if (!a) redirect("/login");
  if (!a.companyId) throw new Error("No company");
  return a;
}

function twilioAuthHeader(): string {
  return "Basic " + Buffer.from(`${env.twilioAccountSid()}:${env.twilioAuthToken()}`).toString("base64");
}

export async function searchAvailableNumbers(areaCode: string): Promise<ProvisionResult<AvailableNumber[]>> {
  await acting();
  const code = areaCode.replace(/\D/g, "");
  if (code.length !== 3) return { ok: false, error: "Enter a 3-digit area code, like 516." };

  try {
    const sid = env.twilioAccountSid();
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${code}&SmsEnabled=true&PageSize=10`;
    const resp = await fetch(url, { headers: { Authorization: twilioAuthHeader() } });
    const json = (await resp.json()) as {
      available_phone_numbers?: Array<{ phone_number: string; friendly_name: string; locality: string | null; region: string | null }>;
      message?: string;
    };
    if (!resp.ok) throw new Error(json.message ?? `Twilio ${resp.status}`);
    const nums = (json.available_phone_numbers ?? []).map((n) => ({
      e164: n.phone_number,
      friendly: n.friendly_name,
      locality: n.locality,
      region: n.region,
    }));
    if (!nums.length) return { ok: false, error: `No numbers left in ${code} right now. Try a nearby area code.` };
    return { ok: true, data: nums };
  } catch {
    return { ok: false, error: "Could not search numbers right now. Try again in a minute." };
  }
}

export async function claimNumber(e164: string): Promise<ProvisionResult<{ e164: string; simulated: boolean }>> {
  const a = await acting();
  const admin = createAdminClient();

  if (!/^\+1\d{10}$/.test(e164)) return { ok: false, error: "That number does not look right. Search again." };

  // Paid-subscription gate: claiming requires a live paid subscription
  // (trialing counts: the trial is card-charged $1 and the number is part of
  // onboarding). past_due/canceled/suspended cannot spend money.
  const { data: co } = await admin
    .from("companies")
    .select("name, subscription_status, suspended_at")
    .eq("id", a.companyId!)
    .maybeSingle();
  const paid = co && !co.suspended_at && (co.subscription_status === "trialing" || co.subscription_status === "active");
  if (!paid) return { ok: false, error: "Your subscription is not active, so we cannot set up a number. Check Billing in Settings." };

  const { data: existing } = await admin
    .from("phone_numbers")
    .select("id, e164")
    .eq("company_id", a.companyId!)
    .neq("status", "released")
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: false, error: `You already have a ReKnock number (${existing.e164 ?? "pending"}).` };

  const canBuy = process.env.VERCEL_ENV === "production" && process.env.ALLOW_NUMBER_PURCHASE === "true";
  let twilioSid: string | null = null;

  if (canBuy) {
    // Belt and braces: even if the gate above is ever edited wrong, no
    // non-production environment may reach Twilio's purchase API. Money only
    // moves on production.
    if (process.env.VERCEL_ENV !== "production") {
      throw new Error("Number purchase attempted outside production. Refusing.");
    }
    try {
      const sid = env.twilioAccountSid();
      // Buy the number.
      const buyResp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, {
        method: "POST",
        headers: { Authorization: twilioAuthHeader(), "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ PhoneNumber: e164, SmsEnabled: "true" }),
      });
      const bought = (await buyResp.json()) as { sid?: string; message?: string };
      if (!buyResp.ok || !bought.sid) throw new Error(bought.message ?? `Twilio ${buyResp.status}`);
      twilioSid = bought.sid;

      // Attach it to our Messaging Service (inherits the inbound webhook).
      const svcResp = await fetch(
        `https://messaging.twilio.com/v1/Services/${env.twilioMessagingServiceSid()}/PhoneNumbers`,
        {
          method: "POST",
          headers: { Authorization: twilioAuthHeader(), "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ PhoneNumberSid: bought.sid }),
        },
      );
      if (!svcResp.ok) {
        const err = (await svcResp.json().catch(() => null)) as { message?: string } | null;
        throw new Error(err?.message ?? `Messaging Service attach failed (${svcResp.status})`);
      }
    } catch (e) {
      await admin.from("failed_jobs").insert({
        company_id: a.companyId!,
        job_type: "number_claim",
        payload: { e164 },
        error: e instanceof Error ? e.message : String(e),
      });
      return { ok: false, error: "We could not claim that number. It may have just been taken. Pick another." };
    }
  }

  // Off production nothing is bought: the row gets an obviously-fake +1555
  // test number (never the searched real one, so no drift into anything we
  // do not own). Real sends keep flowing through the shared Messaging
  // Service line either way, because only status='active' rows pin a From.
  const savedE164 = canBuy ? e164 : `+1555${String(Math.floor(1000000 + Math.random() * 9000000))}`;
  const { error: insertErr } = await admin.from("phone_numbers").insert({
    company_id: a.companyId!,
    twilio_sid: twilioSid,
    e164: savedE164,
    status: "pending_10dlc",
    area_code: e164.slice(2, 5),
    tendlc_status: canBuy ? { state: "not_submitted" } : { state: "not_submitted", simulated: true, requested_e164: e164 },
  });
  if (insertErr) {
    // The DB is the real limit: unique e164 across the platform AND unique
    // live number per company (both raceable at the app layer).
    if (insertErr.code === "23505") {
      const dup = insertErr.message.includes("phone_numbers_company_uq")
        ? "You already have a ReKnock number."
        : "Someone just took that number. Pick another.";
      // If we already bought it from Twilio, that money is now unattached;
      // flag it loudly instead of failing silently (weekly recon also catches it).
      if (twilioSid) {
        await notifyAdmin("Number purchase needs attention", [
          `Bought ${e164} (sid ${twilioSid}) for company ${a.companyId} but the DB insert hit a duplicate.`,
          "Release it in Twilio or attach it manually.",
        ]);
      }
      return { ok: false, error: dup };
    }
    return { ok: false, error: "Could not save your number. Try again." };
  }

  await admin.from("events").insert({
    company_id: a.companyId!,
    type: "number_claimed",
    payload: { e164: savedE164, requested_e164: e164, simulated: !canBuy },
  });
  if (canBuy) {
    // Money moved in Twilio: the founder always hears about it.
    await notifyAdmin("Twilio number purchased", [
      `Company: ${co?.name ?? a.companyId}`,
      `Number: ${e164}`,
      `Twilio SID: ${twilioSid}`,
      "Recurring cost: about $1.15/mo until released.",
    ]);
  }
  if (a.impersonating) {
    await logAudit(a.client, {
      actorUserId: a.actorUserId,
      actorEmail: a.actorEmail,
      action: "support_claim_number",
      targetCompanyId: a.companyId,
      metadata: { e164 },
    });
  }

  // "Save this contact" test text to the contractor's own cell.
  const { data: owner } = await admin
    .from("users")
    .select("cell_phone")
    .eq("company_id", a.companyId!)
    .not("cell_phone", "is", null)
    .limit(1)
    .maybeSingle();
  if (owner?.cell_phone) {
    await sendSms({
      companyId: a.companyId!,
      prospectId: null,
      to: owner.cell_phone,
      body: `This is your new ReKnock number: ${savedE164}. Save this contact. Your follow-up replies will show up here once carriers finish activating it (usually 1 to 2 days).`,
      idempotencyKey: `claim-test:${a.companyId}`,
      kind: "owner_ping",
      isRelay: true,
    });
  }

  return { ok: true, data: { e164: savedE164, simulated: !canBuy } };
}
