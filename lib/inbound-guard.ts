import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { notifyAdmin } from "@/lib/notify-admin";

// Emergency kill switch for inbound email. The per-message loop guards
// (forwarder identity, X-ReKnock-Forwarded marker, forward-rate breaker,
// off-domain destinations) each filter individual messages; this layer
// assumes any of them can have an edge case and instead disables the Resend
// webhook ITSELF via the API the moment ingestion volume exceeds what
// legitimate traffic can produce. A loop that survives every filter still
// dies here because the mail stops arriving at all. Re-enabling is a
// deliberate human action in the Resend dashboard or API.
//
// The trip threshold lives with its caller; this module only knows how to
// pull the plug and make noise about it.

export async function emergencyDisableInboundWebhooks(reason: string, meta: Record<string, unknown>): Promise<void> {
  const admin = createAdminClient();
  const key = process.env.RESEND_API_KEY;
  const disabled: string[] = [];
  let apiError: string | null = null;

  try {
    if (!key) throw new Error("RESEND_API_KEY missing; cannot disable webhooks");
    const list = await fetch("https://api.resend.com/webhooks", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!list.ok) throw new Error(`webhook list failed: ${list.status}`);
    const body = (await list.json()) as { data?: { id: string; status?: string; events?: string[] }[] };
    for (const hook of body.data ?? []) {
      if (hook.status === "disabled") continue;
      if (hook.events && !hook.events.includes("email.received")) continue;
      const resp = await fetch(`https://api.resend.com/webhooks/${hook.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      });
      if (resp.ok) disabled.push(hook.id);
      else apiError = `disable ${hook.id} failed: ${resp.status}`;
    }
  } catch (e) {
    apiError = e instanceof Error ? e.message : String(e);
  }

  await admin.from("failed_jobs").insert({
    company_id: null,
    job_type: "inbound_webhook_emergency_disable",
    payload: { reason, ...meta, disabled_webhook_ids: disabled, api_error: apiError },
    error: reason,
  });
  await notifyAdmin("Inbound email webhook auto-disabled", [
    reason,
    disabled.length
      ? `Disabled Resend webhook(s): ${disabled.join(", ")}.`
      : `WARNING: no webhook was disabled${apiError ? ` (${apiError})` : ""} - disable it manually in the Resend dashboard NOW.`,
    "Mail sent while disabled is NOT lost: Resend keeps received emails retrievable via the received-emails API.",
    "Re-enable only after a human has confirmed the cause (Resend dashboard -> Webhooks).",
  ]);
}
