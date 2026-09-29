import { headers } from "next/headers";
import { env } from "@/lib/env";

// The origin the user is actually on, derived from request headers. This is
// what email confirmation links, magic links, and Stripe return URLs must use,
// so they always point back to the same deployment (preview, localhost, prod)
// instead of a hardcoded APP_URL. Falls back to APP_URL if headers are absent.
export async function siteOrigin(): Promise<string> {
  // Branch previews can be reported as "production" by Vercel when a project
  // uses a production branch. Use the stable branch URL so confirmation links
  // return to the same origin as the page that started signup, not a one-off
  // deployment URL or the production custom domain.
  const isPreview = process.env.VERCEL_GIT_COMMIT_REF !== "main" || process.env.VERCEL_ENV !== "production";
  if (isPreview) {
    const previewHost = process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL;
    if (previewHost) return `https://${previewHost}`;
  }

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return env.appUrl();
}
