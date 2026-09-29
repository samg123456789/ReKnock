import { headers } from "next/headers";
import { env } from "@/lib/env";

// The origin the user is actually on, derived from request headers. This is
// what email confirmation links, magic links, and Stripe return URLs must use,
// so they always point back to the same deployment (preview, localhost, prod)
// instead of a hardcoded APP_URL. Falls back to APP_URL if headers are absent.
export async function siteOrigin(): Promise<string> {
  // Vercel's deployment URL is the safest source for auth and checkout links
  // in preview. A forwarded host can be the production custom domain when a
  // preview is opened from an existing browser session.
  if (process.env.VERCEL_ENV !== "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return env.appUrl();
}
