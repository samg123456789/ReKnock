// Central env access. Read lazily so a missing var fails at the call site with a
// clear message (fail loud internally, ground rule 10) instead of crashing the
// build. Never import this into client components for anything but NEXT_PUBLIC_*.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const env = {
  appUrl: () => process.env.APP_URL ?? "http://localhost:3000",
  // Non-production everywhere except Vercel Production.
  isProd: () => process.env.VERCEL_ENV === "production",

  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),

  stripeSecretKey: () => required("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => required("STRIPE_WEBHOOK_SECRET"),

  resendApiKey: () => required("RESEND_API_KEY"),
};
