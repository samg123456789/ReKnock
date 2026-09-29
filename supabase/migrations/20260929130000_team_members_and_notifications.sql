-- Team access is capability-based, not seat-billed. Usage remains the billing
-- boundary. Existing owners remain valid and every company keeps one owner.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role in ('owner', 'admin', 'member'));
alter table public.users add column if not exists notification_preferences jsonb not null default '{"replies": true, "delivery": true, "usage": true, "weekly": true}'::jsonb;

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  invited_by uuid references public.users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz
);

create unique index if not exists company_invitations_email_uq
  on public.company_invitations (company_id, lower(email))
  where accepted_at is null;
create index if not exists company_invitations_token_idx on public.company_invitations (token_hash);
create index if not exists company_invitations_company_idx on public.company_invitations (company_id, created_at desc);
create trigger company_invitations_set_updated_at before update on public.company_invitations for each row execute function public.set_updated_at();

alter table public.company_invitations enable row level security;
create policy company_invitations_rw on public.company_invitations
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());
