"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { processProductAgentEvent } from "@/lib/company-os/product-agent-runner";

export async function retryProductAgentEvent(agentEventId: string): Promise<void> {
  const { admin } = await requireAdmin();
  const { data: event } = await admin
    .from("agent_events")
    .select("id, source, event_type, status")
    .eq("id", agentEventId)
    .maybeSingle();

  if (!event || event.source !== "github" || event.event_type !== "push") return;
  if (event.status !== "failed") return;

  await processProductAgentEvent(agentEventId);
  revalidatePath("/admin/company-os");
}
