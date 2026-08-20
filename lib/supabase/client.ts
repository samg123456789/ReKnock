"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client (anon key, RLS enforced).
//
// NEXT_PUBLIC_* vars MUST be referenced here as literal
// process.env.NEXT_PUBLIC_* expressions (no helper, no dynamic key) so Next.js
// statically inlines them into the browser bundle. Reading them through a
// helper or a computed key leaves them undefined client-side.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
