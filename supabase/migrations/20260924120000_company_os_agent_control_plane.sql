-- Company OS shared control plane for Compass, Forge, and Signal.
-- These are internal platform tables. Server-side service-role code is the only
-- intended access path; RLS remains enabled as a defense-in-depth boundary.

create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent text not null check (agent in ('compass', 'forge', 'signal')),
  task_type text not null,
  status text not null default 'queued'
    check (status in ('queued', 'claimed', 'completed', 'failed', 'cancelled')),
  priority int not null default 50 check (priority between 0 and 100),
  risk text not null default 'low'
    check (risk in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text,
  source text not null,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  attempt_count int not null default 0 check (attempt_count >= 0),
  max_attempts int not null default 3 check (max_attempts between 1 and 10),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  approval_required boolean not null default false,
  unique (agent, dedupe_key)
);

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent text not null check (agent in ('compass', 'forge', 'signal')),
  task_id uuid references public.agent_tasks(id) on delete set null,
  run_type text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'skipped')),
  trigger text not null default 'scheduled',
  model text,
  input jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.agent_approvals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent text not null check (agent in ('compass', 'forge', 'signal')),
  task_id uuid references public.agent_tasks(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  approval_type text not null
    check (approval_type in ('content_draft', 'external_communication', 'production_change', 'other')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  title text not null,
  summary text,
  draft_content text,
  channel text,
  source_type text,
  source_id uuid,
  dedupe_key text not null,
  payload jsonb not null default '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  unique (agent, dedupe_key)
);

create index agent_tasks_status_priority_idx on public.agent_tasks (status, priority desc, available_at);
create index agent_tasks_agent_created_idx on public.agent_tasks (agent, created_at desc);
create index agent_tasks_source_idx on public.agent_tasks (source, created_at desc);
create index agent_runs_agent_created_idx on public.agent_runs (agent, created_at desc);
create index agent_runs_status_idx on public.agent_runs (status, created_at desc);
create index agent_approvals_status_created_idx on public.agent_approvals (status, created_at desc);
create index agent_approvals_agent_idx on public.agent_approvals (agent, created_at desc);

create trigger agent_tasks_set_updated_at before update on public.agent_tasks
  for each row execute function public.set_updated_at();
create trigger agent_runs_set_updated_at before update on public.agent_runs
  for each row execute function public.set_updated_at();
create trigger agent_approvals_set_updated_at before update on public.agent_approvals
  for each row execute function public.set_updated_at();

alter table public.agent_tasks enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_approvals enable row level security;
