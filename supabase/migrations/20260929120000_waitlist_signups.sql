-- Public waitlist intake. This is intentionally separate from auth accounts:
-- joining the waitlist should not create a half-configured customer account.
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  full_name text,
  trade text,
  team_size text,
  monthly_quotes text,
  current_follow_up text,
  interested_plan text,
  notes text,
  source text
);

create unique index if not exists waitlist_signups_email_uq
  on public.waitlist_signups (lower(email));

alter table public.waitlist_signups enable row level security;

-- The public form writes through a server action using the service role. No
-- anonymous read policy is intentional: waitlist entries are private.
