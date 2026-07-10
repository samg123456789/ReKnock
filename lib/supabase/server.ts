import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Server-side Supabase client bound to the request cookies (anon key, RLS
// enforced). Use in Server Components, Route Handlers, and Server Actions.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component without a mutable cookie store.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

// Service-role client: bypasses RLS. Server-only, never expose to the browser.
// Use for webhook handlers and cross-tenant/system writes.
export function createAdminClient() {
  return createSbClient(env.supabaseUrl(), env.supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
