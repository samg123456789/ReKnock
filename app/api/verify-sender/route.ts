import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// Confirms an extra sender email for the shared quotes@ intake address. The
// token is single-use: cleared the moment it verifies.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const dest = new URL("/settings", process.env.APP_URL ?? request.nextUrl.origin);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("company_sender_emails")
      .update({ verified_at: new Date().toISOString(), verify_token: null })
      .eq("verify_token", token)
      .is("verified_at", null)
      .select("id")
      .maybeSingle();
    dest.searchParams.set("sender", data ? "verified" : "invalid");
  } else {
    dest.searchParams.set("sender", "invalid");
  }
  dest.hash = "forwarding";
  return NextResponse.redirect(dest);
}
