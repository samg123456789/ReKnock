-- Phase 4: prospect notes (fed into AI drafting) + per-prospect per-step
-- overrides so a contractor can edit or skip an upcoming scheduled follow-up
-- from the thread, honored at send time by the sequence engine.

alter table public.prospects add column if not exists notes text;

create table if not exists public.sequence_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  step_index int not null,               -- 0-based, matches messages.sequence_step
  action text not null check (action in ('skip', 'custom')),
  custom_text text,                       -- used when action = 'custom'
  unique (prospect_id, step_index)
);

alter table public.sequence_overrides enable row level security;

-- Same company-scoped policy shape as every other tenant table.
create policy sequence_overrides_rw on public.sequence_overrides
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
