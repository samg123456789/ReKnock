import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import { AI_MODEL } from "@/lib/ai";
import type { AgentName } from "@/lib/company-os/agent-registry";

export type AgentTaskStatus = "queued" | "claimed" | "completed" | "failed" | "cancelled";
export type AgentRunStatus = "running" | "completed" | "failed" | "skipped";
export type AgentRisk = "low" | "medium" | "high" | "critical";

export type AgentTask = {
  id: string;
  agent: AgentName;
  task_type: string;
  status: AgentTaskStatus;
  priority: number;
  risk: AgentRisk;
  title: string;
  description: string | null;
  source: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: string | null;
  attempt_count: number;
  max_attempts: number;
  available_at: string;
  claimed_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  approval_required: boolean;
};

export type AgentRun = {
  id: string;
  agent: AgentName;
  task_id: string | null;
  status: AgentRunStatus;
};

export type AgentApproval = {
  id: string;
  agent: AgentName;
  task_id: string | null;
  run_id: string | null;
  approval_type: string;
  status: "pending" | "approved" | "rejected" | "expired";
  title: string;
  summary: string | null;
  draft_content: string | null;
  channel: string | null;
  source_type: string | null;
  source_id: string | null;
  dedupe_key: string;
  payload: Record<string, unknown>;
};

export async function createAgentTask(input: {
  agent: AgentName;
  taskType: string;
  title: string;
  description?: string | null;
  source: string;
  dedupeKey: string;
  priority?: number;
  risk?: AgentRisk;
  payload?: Record<string, unknown>;
  approvalRequired?: boolean;
  maxAttempts?: number;
}): Promise<{ task: AgentTask; created: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_tasks")
    .insert({
      agent: input.agent,
      task_type: input.taskType,
      title: input.title.slice(0, 240),
      description: input.description ?? null,
      source: input.source,
      dedupe_key: input.dedupeKey,
      priority: input.priority ?? 50,
      risk: input.risk ?? "low",
      payload: input.payload ?? {},
      approval_required: input.approvalRequired ?? false,
      max_attempts: input.maxAttempts ?? 3,
    })
    .select("*")
    .single();

  if (!error && data) return { task: data as AgentTask, created: true };
  if (error?.code !== "23505") throw new Error(error?.message ?? "agent task was not created");

  const { data: existing, error: existingError } = await admin
    .from("agent_tasks")
    .select("*")
    .eq("agent", input.agent)
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  if (existingError || !existing) throw new Error(existingError?.message ?? "existing agent task was not found");
  return { task: existing as AgentTask, created: false };
}

export async function claimAgentTask(taskId: string): Promise<AgentTask | null> {
  const admin = createAdminClient();
  const { data: current, error: readError } = await admin.from("agent_tasks").select("*").eq("id", taskId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!current) return null;

  const task = current as AgentTask;
  if (!["queued", "failed"].includes(task.status)) return null;
  if (task.attempt_count >= task.max_attempts) return null;
  if (new Date(task.available_at).getTime() > Date.now()) return null;

  const { data: claimed, error: claimError } = await admin
    .from("agent_tasks")
    .update({
      status: "claimed",
      claimed_at: new Date().toISOString(),
      error: null,
      attempt_count: task.attempt_count + 1,
    })
    .eq("id", task.id)
    .eq("status", task.status)
    .eq("attempt_count", task.attempt_count)
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  return (claimed as AgentTask | null) ?? null;
}

export async function completeAgentTask(taskId: string, result: Record<string, unknown> = {}): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_tasks")
    .update({ status: "completed", result, completed_at: new Date().toISOString(), error: null })
    .eq("id", taskId)
    .eq("status", "claimed")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;

  const { data: existing, error: readError } = await admin.from("agent_tasks").select("status").eq("id", taskId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.status === "completed") return;
  throw new Error(`agent task ${taskId} was not claimable for completion`);
}

export async function failAgentTask(taskId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_tasks")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      available_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      error: message.slice(0, 4000),
    })
    .eq("id", taskId)
    .eq("status", "claimed")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return;

  const { data: existing, error: readError } = await admin.from("agent_tasks").select("status").eq("id", taskId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (existing?.status === "failed") return;
  throw new Error(`agent task ${taskId} was not claimable for failure`);
}

export async function createAgentRun(input: {
  agent: AgentName;
  taskId?: string | null;
  runType: string;
  trigger?: string;
  model?: string | null;
  input?: Record<string, unknown>;
}): Promise<AgentRun> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_runs")
    .insert({
      agent: input.agent,
      task_id: input.taskId ?? null,
      run_type: input.runType,
      trigger: input.trigger ?? "scheduled",
      model: input.model === undefined ? AI_MODEL : input.model,
      input: input.input ?? {},
    })
    .select("id, agent, task_id, status")
    .single();
  if (error || !data) throw new Error(error?.message ?? "agent run was not created");
  return data as AgentRun;
}

export async function completeAgentRun(runId: string, result: Record<string, unknown> = {}): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("agent_runs")
    .update({ status: "completed", result, finished_at: new Date().toISOString(), error: null })
    .eq("id", runId)
    .eq("status", "running");
  if (error) throw new Error(error.message);
}

export async function failAgentRun(runId: string, message: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("agent_runs")
    .update({ status: "failed", error: message.slice(0, 4000), finished_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running");
  if (error) throw new Error(error.message);
}

export async function createAgentApproval(input: {
  agent: AgentName;
  taskId?: string | null;
  runId?: string | null;
  approvalType: "content_draft" | "external_communication" | "production_change" | "other";
  title: string;
  summary?: string | null;
  draftContent?: string | null;
  channel?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  dedupeKey: string;
  payload?: Record<string, unknown>;
}): Promise<{ approval: AgentApproval; created: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_approvals")
    .insert({
      agent: input.agent,
      task_id: input.taskId ?? null,
      run_id: input.runId ?? null,
      approval_type: input.approvalType,
      title: input.title.slice(0, 240),
      summary: input.summary ?? null,
      draft_content: input.draftContent ?? null,
      channel: input.channel ?? null,
      source_type: input.sourceType ?? null,
      source_id: input.sourceId ?? null,
      dedupe_key: input.dedupeKey,
      payload: input.payload ?? {},
    })
    .select("*")
    .single();
  if (!error && data) return { approval: data as AgentApproval, created: true };
  if (error?.code !== "23505") throw new Error(error?.message ?? "agent approval was not created");

  const { data: existing, error: existingError } = await admin
    .from("agent_approvals")
    .select("*")
    .eq("agent", input.agent)
    .eq("dedupe_key", input.dedupeKey)
    .maybeSingle();
  if (existingError || !existing) throw new Error(existingError?.message ?? "existing agent approval was not found");
  return { approval: existing as AgentApproval, created: false };
}
