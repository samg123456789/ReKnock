import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { AI_MODEL } from "@/lib/ai";
import {
  branchFromRef,
  productAgentEmailTo,
  runProductAgent,
  sendProductAgentEmail,
  type GithubPushPayload,
} from "@/lib/company-os/product-agent";

type AgentEventRow = {
  id: string;
  status: string;
  event_type: string;
  payload: GithubPushPayload;
};

export async function findNextQueuedProductAgentEvent(): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_events")
    .select("id")
    .eq("source", "github")
    .eq("event_type", "push")
    .in("status", ["queued", "failed"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function processProductAgentEvent(agentEventId: string): Promise<{
  skipped?: string;
  ignored?: string;
  runId?: string;
  repository?: string;
  branch?: string;
  emailed?: boolean;
}> {
  const admin = createAdminClient();
  const { data: agentEvent } = await admin
    .from("agent_events")
    .select("id, status, event_type, payload")
    .eq("id", agentEventId)
    .maybeSingle();

  const row = agentEvent as AgentEventRow | null;
  if (!row) return { skipped: "missing_event" };
  if (row.status === "processed") return { skipped: "already_processed" };
  if (row.event_type !== "push") return { skipped: "not_push" };

  await admin.from("agent_events").update({ status: "processing", error: null }).eq("id", agentEventId);

  const payload = row.payload;
  if (payload.deleted) {
    await admin
      .from("agent_events")
      .update({ status: "ignored", processed_at: new Date().toISOString(), error: "deleted ref" })
      .eq("id", agentEventId);
    return { ignored: "deleted_ref" };
  }

  const repo = payload.repository?.full_name ?? payload.repository?.name ?? "unknown";
  const branch = branchFromRef(payload.ref);
  const commitSha = payload.after ?? payload.head_commit?.id ?? null;
  const commitCount = payload.commits?.length ?? 0;
  const to = productAgentEmailTo();

  const { data: run, error: runError } = await admin
    .from("product_agent_runs")
    .insert({
      agent_event_id: agentEventId,
      status: "processing",
      repository: repo,
      branch,
      commit_sha: commitSha,
      commit_count: commitCount,
      email_to: to,
      model: AI_MODEL,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(runError?.message ?? "product agent run was not created");

  const runId = run.id as string;
  try {
    const agent = await runProductAgent(payload);

    await admin.from("product_changelog_entries").insert({
      agent_run_id: runId,
      repository: repo,
      branch,
      commit_sha: commitSha,
      commit_count: commitCount,
      title: agent.output.title,
      body: agent.output.changelog,
      product_area: agent.output.productArea,
      customer_impact: agent.output.customerImpact,
      internal_notes: agent.output.internalNotes,
      compare_url: payload.compare ?? null,
    });
    await admin
      .from("product_agent_runs")
      .update({
        status: "completed",
        summary: agent.output.changelog,
        product_ideas: agent.output.productIdeas,
        user_experience_notes: agent.output.userExperienceNotes,
        growth_revenue_notes: agent.output.growthRevenueNotes,
        risks: agent.output.risks,
        action_items: agent.output.actionItems,
        input_tokens: agent.usage.inputTokens,
        output_tokens: agent.usage.outputTokens,
      })
      .eq("id", runId);

    const emailed = await sendProductAgentEmail({ to, payload, output: agent.output, runId });
    if (emailed) {
      await admin.from("product_agent_runs").update({ email_sent_at: new Date().toISOString() }).eq("id", runId);
    }

    await admin
      .from("agent_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), error: null })
      .eq("id", agentEventId);
    await admin.from("events").insert({
      company_id: null,
      type: "company_os.product_agent.completed",
      payload: { agent_event_id: agentEventId, run_id: runId, repository: repo, branch, emailed },
    });

    return { runId, repository: repo, branch, emailed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await Promise.all([
      admin.from("product_agent_runs").update({ status: "failed", error: message }).eq("id", runId),
      admin
        .from("agent_events")
        .update({ status: "failed", processed_at: new Date().toISOString(), error: message })
        .eq("id", agentEventId),
      admin.from("failed_jobs").insert({
        job_type: "product_agent_github_push",
        payload: { agent_event_id: agentEventId, run_id: runId, repository: repo, branch },
        error: message,
      }),
    ]);
    throw err;
  }
}
