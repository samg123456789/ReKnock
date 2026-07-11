-- Admin actions: suspend flag + append-only audit log.

alter table public.companies add column if not exists suspended_at timestamptz;

create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_email text,
  action text not null,
  target_company_id uuid,
  metadata jsonb
);
-- Only the service-role client (the admin surface) may touch this. RLS on with
-- no policies = no anon/authenticated access.
alter table public.admin_audit enable row level security;
