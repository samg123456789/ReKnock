import type { NextConfig } from "next";

// Deploy-time guard: production must have a public https APP_URL, or Twilio
// delivery-status callbacks (lib/twilio.ts) silently skip and the ledger
// never learns whether carriers delivered or filtered our messages. Failing
// the build here is deliberate: on Vercel, env changes only apply via a
// redeploy, so this check gates every config that can reach production.
if (process.env.VERCEL_ENV === "production") {
  const appUrl = process.env.APP_URL ?? "";
  if (!appUrl.startsWith("https://")) {
    throw new Error(
      `Production build blocked: APP_URL must be the public https URL of the deployment (got ${JSON.stringify(appUrl || null)}). ` +
        "Set it in Vercel > Settings > Environment Variables (Production), then redeploy. " +
        "Without it, Twilio StatusCallback is skipped and delivery failures (30007/30034) go unrecorded.",
    );
  }
}

const nextConfig: NextConfig = {};
export default nextConfig;
