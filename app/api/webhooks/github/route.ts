import { createHmac, timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";

function verifyGithubSignature(request: NextRequest, body: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-hub-signature-256");
  if (!header?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  if (!verifyGithubSignature(request, body)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const eventType = request.headers.get("x-github-event") ?? "unknown";
  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId) return NextResponse.json({ error: "missing delivery id" }, { status: 400 });

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("agent_events")
    .insert({
      source: "github",
      event_type: eventType,
      external_id: deliveryId,
      status: eventType === "push" ? "queued" : "ignored",
      payload,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    await admin.from("failed_jobs").insert({
      job_type: "github_webhook_persist",
      payload: { event_type: eventType, delivery_id: deliveryId },
      error: error.message,
    });
    return NextResponse.json({ error: "persist failed" }, { status: 500 });
  }

  if (eventType === "push") {
    await inngest.send({ name: "product/github.push", data: { agent_event_id: row.id } });
  }

  return NextResponse.json({ received: true, queued: eventType === "push" });
}
