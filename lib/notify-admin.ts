import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

// Platform-admin notification: always writes an events row (never lost), then
// best-effort email via Resend to every platform_admin user. Used whenever
// money moves (Twilio number purchases/releases) and by the weekly number
// reconciliation, so the founder always hears about it.
export async function notifyAdmin(subject: string, lines: string[]): Promise<void> {
  const admin = createAdminClient();

  await admin.from("events").insert({
    company_id: null,
    type: "admin.notification",
    payload: { subject, lines },
  });

  try {
    const key = process.env.RESEND_API_KEY;
    if (!key) return;
    const { data: admins } = await admin
      .from("users")
      .select("email")
      .eq("platform_admin", true)
      .not("email", "is", null);
    const to = (admins ?? []).map((a) => a.email as string);
    if (!to.length) return;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: "ReKnock Ops <ops@getreknock.com>",
        to,
        subject: `[ReKnock] ${subject}`,
        text: lines.join("\n"),
      }),
    });
    if (!resp.ok) throw new Error(`Resend ${resp.status}`);
  } catch (e) {
    await admin.from("failed_jobs").insert({
      job_type: "admin_notify_email",
      payload: { subject },
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
