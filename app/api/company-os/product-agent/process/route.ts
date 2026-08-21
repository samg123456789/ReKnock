import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
  findNextQueuedProductAgentEvent,
  processProductAgentEvent,
} from "@/lib/company-os/product-agent-runner";

function authorized(request: NextRequest): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const provided = request.headers.get("x-company-os-secret");
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const explicitId = typeof body.agent_event_id === "string" ? body.agent_event_id : null;
  const agentEventId = explicitId ?? (await findNextQueuedProductAgentEvent());
  if (!agentEventId) return NextResponse.json({ processed: false, reason: "no_queued_events" });

  const result = await processProductAgentEvent(agentEventId);
  return NextResponse.json({ processed: true, agent_event_id: agentEventId, result });
}
