import "server-only";
import { notFound } from "next/navigation";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Gate for every /admin route. Non-admins (and logged-out users) get a 404 so
// the surface is never advertised. Returns the service-role client for the
// cross-tenant reads admin screens need.
export async function requireAdmin(): Promise<{ adminUserId: string; admin: SupabaseClient }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: me } = await supabase
    .from("users")
    .select("id, platform_admin")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!me?.platform_admin) notFound();

  return { adminUserId: me.id, admin: createAdminClient() };
}
