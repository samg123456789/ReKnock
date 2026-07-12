import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const VIEW_AS_COOKIE = "reknock_admin_view_as";

// The company the current request should act on. Normally the user's own
// company (RLS client). If a platform admin has an active view-as cookie, it
// resolves to the target company via the service-role client. SECURITY: the
// cookie only grants power when the requester is verified platform_admin
// server-side on THIS request, so a forged cookie by a non-admin does nothing.
export type Acting = {
  client: SupabaseClient;
  companyId: string | null;
  impersonating: boolean;
  companyName: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
};

// Wrapped in React cache() so the auth check + users lookup runs once per
// request even though layout AND page both call it (was 2 round-trips per
// authed navigation). Dedupes across the whole server render pass.
export const getActingCompany = cache(async (): Promise<Acting | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: me } = await supabase
    .from("users")
    .select("id, company_id, platform_admin, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const target = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (target && me?.platform_admin) {
    const admin = createAdminClient();
    const { data: co } = await admin.from("companies").select("id, name").eq("id", target).maybeSingle();
    if (co) {
      return {
        client: admin,
        companyId: co.id,
        impersonating: true,
        companyName: co.name,
        actorUserId: me.id,
        actorEmail: me.email ?? null,
      };
    }
  }

  return {
    client: supabase,
    companyId: me?.company_id ?? null,
    impersonating: false,
    companyName: null,
    actorUserId: me?.id ?? null,
    actorEmail: me?.email ?? null,
  };
});
