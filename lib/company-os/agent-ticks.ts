import "server-only";

import { generateText, parseJson } from "@/lib/ai";
import {
  claimAgentTask,
  completeAgentRun,
  completeAgentTask,
  createAgentApproval,
  createAgentRun,
  createAgentTask,
  failAgentRun,
  failAgentTask,
} from "@/lib/company-os/agent-control-plane";
import { createAdminClient } from "@/lib/supabase/server";
import type { AgentName } from "@/lib/company-os/agent-registry";

type ProductRunRow = {
  id: string;
  created_at: string;
  status: string;
  repository: string | null;
  branch: string | null;
  summary: string | null;
  action_items: unknown;
  product_ideas: unknown;
  risks: unknown;
};

type ChangelogRow = {
  id: string;
  created_at: string;
  title: string;
  body: string;
  product_area: string | null;
  customer_impact: string | null;
  compare_url: string | null;
};

type FailedJobRow = {
  id: string;
  created_at: string;
  job_type: string;
  payload: unknown;
  error: string | null;
};

type TickResult = {
  agent: AgentName;
  tasksCreated: number;
  tasksProcessed?: number;
  approvalsCreated?: number;
};

async function runTick<T extends TickResult>(agent: AgentName, input: Record<string, unknown>, work: (runId: string) => Promise<T>): Promise<T> {
  const run = await createAgentRun({ agent, runType: "scheduled_tick", input });
  try {
    const result = await work(run.id);
    await completeAgentRun(run.id, result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failAgentRun(run.id, message);
    throw error;
  }
}

export async function runCompassTick(): Promise<TickResult> {
  return runTick("compass", { source: "product_agent_runs" }, async () => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("product_agent_runs")
      .select("id, created_at, status, repository, branch, summary, action_items, product_ideas, risks")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) throw new Error(error.message);

    let tasksCreated = 0;
    for (const run of (data ?? []) as ProductRunRow[]) {
      for (const [index, actionItem] of strings(run.action_items).entries()) {
        const result = await createAgentTask({
          agent: "compass",
          taskType: "product_action_item",
          title: actionItem,
          description: `Product Agent action item from ${run.repository ?? "the repository"} on ${run.branch ?? "the default branch"}.`,
          source: "product_agent",
          dedupeKey: `product-run:${run.id}:action:${index}`,
          priority: 60,
          risk: "medium",
          payload: {
            product_agent_run_id: run.id,
            repository: run.repository,
            branch: run.branch,
            action_item: actionItem,
          },
        });
        if (result.created) tasksCreated++;
      }
    }
    return { agent: "compass", tasksCreated };
  });
}

export async function runForgeTick(): Promise<TickResult> {
  return runTick("forge", { sources: ["failed_jobs", "product_agent_runs"] }, async () => {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const [{ data: failedJobs, error: failedJobsError }, { data: failedRuns, error: failedRunsError }, { data: recommendations, error: recommendationsError }] = await Promise.all([
      admin
        .from("failed_jobs")
        .select("id, created_at, job_type, payload, error")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(40),
      admin
        .from("product_agent_runs")
        .select("id, created_at, repository, branch, summary, error")
        .eq("status", "failed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25),
      admin
        .from("product_agent_runs")
        .select("id, created_at, repository, branch, action_items, risks")
        .eq("status", "completed")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    if (failedJobsError) throw new Error(failedJobsError.message);
    if (failedRunsError) throw new Error(failedRunsError.message);
    if (recommendationsError) throw new Error(recommendationsError.message);

    let tasksCreated = 0;
    for (const job of (failedJobs ?? []) as FailedJobRow[]) {
      const result = await createAgentTask({
        agent: "forge",
        taskType: "reliability_incident",
        title: `Review failed ${job.job_type} job`,
        description: job.error ?? "A background job failed and needs internal review.",
        source: "failed_jobs",
        dedupeKey: `failed-job:${job.id}`,
        priority: 85,
        risk: "high",
        payload: { failed_job_id: job.id, job_type: job.job_type, payload: job.payload, error: job.error },
      });
      if (result.created) tasksCreated++;
    }

    for (const run of (failedRuns ?? []) as Array<ProductRunRow & { error: string | null }>) {
      const result = await createAgentTask({
        agent: "forge",
        taskType: "agent_run_failure",
        title: `Investigate failed Product Agent run in ${run.repository ?? "the repository"}`,
        description: run.error ?? "A Product Agent run failed.",
        source: "product_agent",
        dedupeKey: `product-agent-run-failure:${run.id}`,
        priority: 80,
        risk: "high",
        payload: { product_agent_run_id: run.id, repository: run.repository, branch: run.branch, error: run.error },
      });
      if (result.created) tasksCreated++;
    }

    for (const run of (recommendations ?? []) as ProductRunRow[]) {
      const items = [...strings(run.action_items), ...strings(run.risks)].filter(isForgeRelevant);
      for (const [index, item] of items.entries()) {
        const highRisk = /security|auth|permission|data loss|production|outage|reliab/i.test(item);
        const result = await createAgentTask({
          agent: "forge",
          taskType: "technical_debt_recommendation",
          title: item,
          description: `Technical or reliability recommendation from Product Agent for ${run.repository ?? "the repository"}.`,
          source: "product_agent",
          dedupeKey: `product-agent-recommendation:${run.id}:${index}`,
          priority: highRisk ? 90 : 65,
          risk: highRisk ? "high" : "medium",
          payload: { product_agent_run_id: run.id, repository: run.repository, branch: run.branch, recommendation: item },
        });
        if (result.created) tasksCreated++;
      }
    }
    return { agent: "forge", tasksCreated };
  });
}

type SignalDraft = {
  channel: string;
  title: string;
  body: string;
  rationale: string;
};

export async function runSignalTick(): Promise<TickResult> {
  return runTick("signal", { source: "product_changelog_entries", mode: "draft_only" }, async (tickRunId) => {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
    const { data, error } = await admin
      .from("product_changelog_entries")
      .select("id, created_at, title, body, product_area, customer_impact, compare_url")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(12);
    if (error) throw new Error(error.message);

    let tasksCreated = 0;
    let tasksProcessed = 0;
    let approvalsCreated = 0;
    for (const entry of (data ?? []) as ChangelogRow[]) {
      const taskResult = await createAgentTask({
        agent: "signal",
        taskType: "content_draft",
        title: `Draft content from: ${entry.title}`,
        description: "Create an internal marketing draft from a product changelog. Publishing remains approval-gated.",
        source: "product_changelog",
        dedupeKey: `product-changelog:${entry.id}:draft`,
        priority: 45,
        risk: "low",
        approvalRequired: true,
        payload: { product_changelog_entry_id: entry.id, title: entry.title, product_area: entry.product_area },
      });
      if (taskResult.created) tasksCreated++;
      if (!["queued", "failed"].includes(taskResult.task.status)) continue;

      const claimed = await claimAgentTask(taskResult.task.id);
      if (!claimed) continue;
      const taskRun = await createAgentRun({
        agent: "signal",
        taskId: claimed.id,
        runType: "content_draft",
        trigger: "scheduled",
        input: { product_changelog_entry_id: entry.id },
      });
      try {
        const draft = await generateSignalDraft(entry);
        const approval = await createAgentApproval({
          agent: "signal",
          taskId: claimed.id,
          runId: taskRun.id,
          approvalType: "content_draft",
          title: draft.title,
          summary: draft.rationale,
          draftContent: draft.body,
          channel: draft.channel,
          sourceType: "product_changelog_entry",
          sourceId: entry.id,
          dedupeKey: claimed.dedupe_key,
          payload: { source_title: entry.title, compare_url: entry.compare_url, tick_run_id: tickRunId },
        });
        if (approval.created) approvalsCreated++;
        await completeAgentTask(claimed.id, { approval_id: approval.approval.id, channel: draft.channel });
        await completeAgentRun(taskRun.id, { approval_id: approval.approval.id, channel: draft.channel });
        tasksProcessed++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await failAgentTask(claimed.id, message);
        await failAgentRun(taskRun.id, message);
      }
    }
    return { agent: "signal", tasksCreated, tasksProcessed, approvalsCreated };
  });
}

async function generateSignalDraft(entry: ChangelogRow): Promise<SignalDraft> {
  const prompt = [
    "Create one internal marketing content draft from this ReKnock product changelog.",
    "The draft is stored for human approval. Do not publish it, send it, or imply that publication occurred.",
    "Use only facts supported by the source. Do not invent customer results, pricing, availability, or quotes.",
    "Return only JSON with this exact shape:",
    JSON.stringify({ channel: "suggested channel", title: "draft title", body: "draft copy", rationale: "why this channel and angle" }),
    "Keep the body under 900 characters and make the suggested channel one of: linkedin, email, website_changelog, experiment.",
    "",
    `Source title: ${entry.title}`,
    `Product area: ${entry.product_area ?? "Unknown"}`,
    `Customer impact: ${entry.customer_impact ?? "Needs review"}`,
    `Changelog: ${entry.body}`,
  ].join("\n");
  const response = await generateText({
    system: "You are Signal, ReKnock's internal marketing draft agent. Approval is mandatory for all external communication.",
    prompt,
    temperature: 0.35,
    maxTokens: 800,
  });
  const parsed = parseJson<Partial<SignalDraft>>(response.text);
  const channel = normalizeChannel(parsed?.channel);
  return {
    channel,
    title: String(parsed?.title || entry.title).slice(0, 240),
    body: String(parsed?.body || response.text).trim().slice(0, 4000),
    rationale: String(parsed?.rationale || "Draft generated from a product changelog for human review.").slice(0, 1200),
  };
}

function normalizeChannel(value: unknown): string {
  const normalized = String(value ?? "experiment").toLowerCase().replace(/[^a-z_]/g, "");
  return ["linkedin", "email", "website_changelog", "experiment"].includes(normalized) ? normalized : "experiment";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [];
}

function isForgeRelevant(item: string): boolean {
  return /build|test|bug|security|auth|permission|reliab|debt|dependency|migration|error|outage|performance|monitor/i.test(item);
}
