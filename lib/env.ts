// Central env access. Read lazily so a missing var fails at the call site with a
// clear message (fail loud internally, ground rule 10) instead of crashing the
// build.
//
// IMPORTANT: NEXT_PUBLIC_* vars must be referenced as STATIC literals
// (process.env.NEXT_PUBLIC_FOO), never via a dynamic key, or Next.js cannot
// inline them into the browser bundle and they read as undefined client-side.
// The server-only vars below use the dynamic helper since they never reach the
// client.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
  // Non-production everywhere except Vercel Production.
  isProd: () => process.env.VERCEL_ENV === "production",

  // Public vars: static references so Next inlines them client-side.
  supabaseUrl: () => {
    const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!v) throw new Error("Missing required env var: NEXT_PUBLIC_SUPABASE_URL");
    return v;
  },
  supabaseAnonKey: () => {
    const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!v) throw new Error("Missing required env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");
    return v;
  },

  // Server-only vars.
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecretKey: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),
  resendApiKey: () => required("RESEND_API_KEY"),
  anthropicApiKey: () => required("ANTHROPIC_API_KEY"),
};
