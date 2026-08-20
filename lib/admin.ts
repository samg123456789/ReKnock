import "server-only";
import { notFound } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Gate for every /admin route. Non-admins (and logged-out users) get a 404 so
// the surface is never advertised. Returns the service-role client for the
// cross-tenant reads admin screens need.
export async function requireAdmin(): Promise<{
  adminUserId: string;
  adminEmail: string | null;
  admin: SupabaseClient;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: me } = await supabase
    .from("users")
    .select("id, email, platform_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me?.platform_admin) notFound();

  return { adminUserId: me.id, adminEmail: me.email ?? null, admin: createAdminClient() };
}

// Append-only audit of admin + support-mode actions. Uses the service-role
// client (admin_audit has RLS on with no policies).
export async function logAudit(
  admin: SupabaseClient,
  entry: {
    actorUserId: string | null;
    actorEmail: string | null;
    action: string;
    targetCompanyId: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from("admin_audit").insert({
    actor_user_id: entry.actorUserId,
    actor_email: entry.actorEmail,
    action: entry.action,
    target_company_id: entry.targetCompanyId,
    metadata: entry.metadata ?? null,
  });
}
