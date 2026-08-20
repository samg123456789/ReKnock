"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin, logAudit } from "@/lib/admin";
import { VIEW_AS_COOKIE } from "@/lib/acting-company";
import { getStripe } from "@/lib/stripe";
import { env } from "@/lib/env";

export type AdminResult = { ok: true } | { ok: false; error: string };

// Enter support mode: view a customer's app exactly as they see it.
export async function enterViewAs(companyId: string): Promise<void> {
  const { adminUserId, adminEmail, admin } = await requireAdmin();
  const { data: co } = await admin.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!co) return;
  (await cookies()).set(VIEW_AS_COOKIE, companyId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });
  await logAudit(admin, { actorUserId: adminUserId, actorEmail: adminEmail, action: "view_as_enter", targetCompanyId: companyId });
  redirect("/app");
}

export async function exitViewAs(): Promise<void> {
  const jar = await cookies();
  const target = jar.get(VIEW_AS_COOKIE)?.value ?? null;
  jar.delete(VIEW_AS_COOKIE);
  try {
    const { adminUserId, adminEmail, admin } = await requireAdmin();
    await logAudit(admin, { actorUserId: adminUserId, actorEmail: adminEmail, action: "view_as_exit", targetCompanyId: target });
  } catch {
    /* exiting is always allowed even if the admin check is odd */
  }
  redirect("/admin");
}

export async function suspendCompany(companyId: string, confirmName: string): Promise<AdminResult> {
  const { adminUserId, adminEmail, admin } = await requireAdmin();
  const { data: co } = await admin.from("companies").select("name, suspended_at").eq("id", companyId).maybeSingle();
  if (!co) return { ok: false, error: "Company not found." };
  if (confirmName.trim() !== (co.name ?? "")) return { ok: false, error: "Name did not match." };

  const suspend = !co.suspended_at;
  await admin.from("companies").update({ suspended_at: suspend ? new Date().toISOString() : null }).eq("id", companyId);
  await logAudit(admin, {
    actorUserId: adminUserId,
    actorEmail: adminEmail,
    action: suspend ? "suspend" : "unsuspend",
    targetCompanyId: companyId,
  });
  return { ok: true };
}

export async function deleteCompany(companyId: string, confirmName: string): Promise<AdminResult> {
  const { adminUserId, adminEmail, admin } = await requireAdmin();
  const { data: co } = await admin
    .from("companies")
    .select("name, stripe_subscription_id")
    .eq("id", companyId)
    .maybeSingle();
  if (!co) return { ok: false, error: "Company not found." };
  if (confirmName.trim() !== (co.name ?? "")) return { ok: false, error: "Name did not match." };

  // Audit before the row is gone.
  await logAudit(admin, {
    actorUserId: adminUserId,
    actorEmail: adminEmail,
    action: "delete",
    targetCompanyId: companyId,
    metadata: { name: co.name },
  });

  // Cancel Stripe subscription.
  if (co.stripe_subscription_id) {
    try {
      await getStripe().subscriptions.cancel(co.stripe_subscription_id);
    } catch {
      /* already canceled or missing */
    }
  }

  // Release any Twilio numbers.
  const { data: numbers } = await admin.from("phone_numbers").select("twilio_sid").eq("company_id", companyId);
  for (const n of numbers ?? []) {
    if (!n.twilio_sid) continue;
    try {
      const sid = env.twilioAccountSid();
      const auth = Buffer.from(`${sid}:${env.twilioAuthToken()}`).toString("base64");
      await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers/${n.twilio_sid}.json`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${auth}` },
      });
    } catch {
      /* best effort */
    }
  }

  // Delete auth users for this company (their app data cascades from the company row).
  const { data: users } = await admin.from("users").select("auth_user_id").eq("company_id", companyId);
  for (const u of users ?? []) {
    if (u.auth_user_id) {
      try {
        await admin.auth.admin.deleteUser(u.auth_user_id);
      } catch {
        /* best effort */
      }
    }
  }

  await admin.from("companies").delete().eq("id", companyId);
  redirect("/admin");
}
