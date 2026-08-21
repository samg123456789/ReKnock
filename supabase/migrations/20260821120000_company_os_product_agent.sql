-- Company OS v1: internal Product Agent.
-- GitHub webhooks are persisted, processed async, summarized for Sam, and
-- stored as a durable changelog. These tables are platform-admin/internal only.

create table public.agent_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null,
  event_type text not null,
  external_id text not null,
  status text not null default 'queued'
    check (status in ('queued','processing','processed','ignored','failed')),
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  unique (source, event_type, external_id)
);

create table public.product_agent_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_event_id uuid not null references public.agent_events(id) on delete cascade,
  status text not null default 'processing'
    check (status in ('processing','completed','failed')),
  repository text,
  branch text,
  commit_sha text,
  commit_count int not null default 0,
  summary text,
  product_ideas jsonb not null default '[]'::jsonb,
  user_experience_notes jsonb not null default '[]'::jsonb,
  growth_revenue_notes jsonb not null default '[]'::jsonb,
  risks jsonb not null default '[]'::jsonb,
  action_items jsonb not null default '[]'::jsonb,
  email_to text,
  email_sent_at timestamptz,
  model text,
  input_tokens int,
  output_tokens int,
  error text
);

create table public.product_changelog_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  agent_run_id uuid not null references public.product_agent_runs(id) on delete cascade,
  repository text,
  branch text,
  commit_sha text,
  commit_count int not null default 0,
  title text not null,
  body text not null,
  product_area text,
  customer_impact text,
  internal_notes text,
  compare_url text
);

create index agent_events_status_idx on public.agent_events (status, created_at);
create index product_agent_runs_created_idx on public.product_agent_runs (created_at desc);
create index product_changelog_entries_created_idx on public.product_changelog_entries (created_at desc);

create trigger agent_events_set_updated_at before update on public.agent_events
  for each row execute function public.set_updated_at();
create trigger product_agent_runs_set_updated_at before update on public.product_agent_runs
  for each row execute function public.set_updated_at();
create trigger product_changelog_entries_set_updated_at before update on public.product_changelog_entries
  for each row execute function public.set_updated_at();

alter table public.agent_events enable row level security;
alter table public.product_agent_runs enable row level security;
alter table public.product_changelog_entries enable row level security;
