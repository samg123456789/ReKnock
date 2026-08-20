import { createHmac, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { bareEmail } from "@/lib/intake-email";
import { emergencyDisableInboundWebhooks } from "@/lib/inbound-guard";

// Ingestion kill switch: the 2026-07-13 loop delivered ~17 emails/minute; no
// legitimate quotes@ traffic at this scale approaches that. Independent of the
// per-message loop filters downstream - this counts raw arrivals and pulls the
// webhook itself when the volume is impossible, so a loop that slips every
// filter still stops at the source within ~a minute.
const INGEST_BURST_LIMIT = 20;
const INGEST_BURST_WINDOW_MS = 5 * 60_000;

// Resend inbound-email webhook (quotes@getreknock.com). Invariant 6: verify
// signature, persist raw, ack fast, process async via Inngest. Resend signs
// with Svix headers; verified manually so we carry no extra dependency.
function verifySvixSignature(req: NextRequest, body: string): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signatures = req.headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  // Reject replays outside a 5-minute window.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
  return signatures.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifySvixSignature(request, body)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const admin = createAdminClient();

  if (event.type !== "email.received") {
    // Other Resend events: keep the raw record, nothing to process.
    await admin.from("events").insert({ company_id: null, type: `resend.${event.type ?? "unknown"}`, payload: event as Record<string, unknown> });
    return NextResponse.json({ received: true });
  }

  const d = (event.data ?? {}) as Record<string, unknown>;
  const rawFrom = typeof d.from === "string" ? d.from : ((d.from as { email?: string } | undefined)?.email ?? "");
  const rawTo = Array.isArray(d.to) ? String(d.to[0] ?? "") : typeof d.to === "string" ? d.to : "";

  const { data: row, error } = await admin
    .from("inbound_emails")
    .insert({
      company_id: null, // matched async; unmatched mail is stored, never dropped
      from_addr: bareEmail(rawFrom) ?? rawFrom.slice(0, 320),
      to_addr: bareEmail(rawTo) ?? rawTo.slice(0, 320),
      subject: typeof d.subject === "string" ? d.subject.slice(0, 500) : null,
      raw: event as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error || !row) {
    await admin.from("failed_jobs").insert({ company_id: null, job_type: "inbound_email_persist", payload: { from: rawFrom }, error: error?.message ?? "no row" });
    return NextResponse.json({ error: "persist failed" }, { status: 500 });
  }

  const { count: recentArrivals } = await admin
    .from("inbound_emails")
    .select("id", { count: "exact", head: true })
    .gt("created_at", new Date(Date.now() - INGEST_BURST_WINDOW_MS).toISOString());
  if ((recentArrivals ?? 0) >= INGEST_BURST_LIMIT) {
    // Persisted but deliberately NOT enqueued for processing: feeding a loop
    // back into the pipeline is how it perpetuates. Rows sit unresolved and
    // can be reprocessed by hand after the cause is understood.
    await emergencyDisableInboundWebhooks(
      `${recentArrivals} inbound emails in ${INGEST_BURST_WINDOW_MS / 60_000} minutes (limit ${INGEST_BURST_LIMIT}) - possible mail loop or abuse`,
      { inbound_email_id: row.id, recent_arrivals: recentArrivals },
    );
    return NextResponse.json({ received: true, halted: true });
  }

  await inngest.send({ name: "email/inbound.received", data: { inboundEmailId: row.id } });
  return NextResponse.json({ received: true });
}
