-- ReKnock initial schema (CLAUDE.md section 2).
-- All tables: id uuid pk, created_at, updated_at. RLS on every table, scoped to
-- the caller's company. Server code uses the service-role key, which bypasses RLS.

-- Extensions -----------------------------------------------------------------
create extension if not exists pg_trgm;      -- fuzzy name+address matching (section 2)

-- updated_at trigger ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Tables ---------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  trade text check (trade in (
    'roofing','painting','landscaping','hvac','plumbing','electrical',
    'remodeling','fencing','concrete','gutters','windows_doors','other'
  )),
  website text,
  description text,
  timezone text not null default 'America/New_York',
  forwarding_slug text unique not null,
  stripe_customer_id text,
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled')),
  trial_messages_used int not null default 0,
  plan text check (plan in ('founding','standard','annual'))
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  full_name text,
  cell_phone text,
  email_confirmed_at timestamptz,
  role text not null default 'owner' check (role in ('owner'))
);

create table public.voice_profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  questionnaire jsonb,
  master_prompt text,
  sample_messages jsonb,
  version int not null default 1,
  is_latest boolean not null default true
);

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  twilio_sid text,
  e164 text,
  status text not null default 'pending_10dlc'
    check (status in ('pending_10dlc','active','failed')),
  area_code text,
  tendlc_status jsonb
);

create table public.sending_windows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  enabled boolean not null default true
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  steps jsonb not null default '[]'::jsonb  -- [{day_offset, template, ai_personalize}]
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  first_name text,
  last_name text,
  phone_e164 text,
  email text,
  address text,
  job_type text,
  quote_amount numeric(12,2),
  quote_date date,
  status text not null default 'new'
    check (status in ('new','sequencing','replied','won','lost','opted_out','paused')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  source text check (source in ('email_forward','bcc','manual','ocr_upload')),
  notes text
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  raw_source text,       -- email | pdf | image
  storage_path text,
  extracted jsonb,
  ocr_confidence numeric
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid references public.prospects(id) on delete cascade,
  direction text not null check (direction in ('outbound','inbound')),
  channel text not null default 'sms' check (channel in ('sms')),
  body text,
  twilio_sid text,
  status text check (status in ('queued','scheduled','sent','delivered','failed','received')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  sequence_step int,
  ai_classification jsonb,
  -- Invariant (CLAUDE.md section 7.1): outbound sends write this BEFORE calling
  -- Twilio; a unique violation means already-sent, so skip. Null for inbound.
  idempotency_key text
);
create unique index messages_idempotency_key_uq
  on public.messages (idempotency_key) where idempotency_key is not null;

create table public.inbound_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  from_addr text,
  to_addr text,
  subject text,
  raw_storage_path text,
  parse_result jsonb,
  resolution text check (resolution in ('new_prospect','updated_prospect','needs_review','ignored')),
  prospect_id uuid references public.prospects(id) on delete set null
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete cascade,  -- null for system events
  type text not null,
  payload jsonb
);

create table public.failed_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid references public.companies(id) on delete set null,
  job_type text not null,
  payload jsonb,
  error text,
  retries int not null default 0
);

-- Indexes --------------------------------------------------------------------
create index users_company_id_idx on public.users (company_id);
create index prospects_company_id_idx on public.prospects (company_id);
create index prospects_phone_idx on public.prospects (company_id, phone_e164);
create index prospects_email_idx on public.prospects (company_id, lower(email));
create index prospects_name_trgm_idx on public.prospects
  using gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'') || ' ' || coalesce(address,'')) gin_trgm_ops);
create index messages_company_prospect_idx on public.messages (company_id, prospect_id, created_at);
create index messages_scheduled_idx on public.messages (status, scheduled_for);
create index events_company_type_idx on public.events (company_id, type, created_at);

-- updated_at triggers --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','users','voice_profiles','phone_numbers','sending_windows',
    'campaigns','prospects','quotes','messages','inbound_emails','events','failed_jobs'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
         for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- Company scoping helper -----------------------------------------------------
-- SECURITY DEFINER so it bypasses RLS internally (no recursion on the users
-- policy). Returns the company_id of the currently authenticated user.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select company_id from public.users where auth_user_id = auth.uid() limit 1;
$$;

-- Row-level security ---------------------------------------------------------
-- Every table: RLS on, access only to rows in the caller's company. The
-- service-role key (server code) bypasses RLS entirely.

alter table public.companies       enable row level security;
alter table public.users           enable row level security;
alter table public.voice_profiles  enable row level security;
alter table public.phone_numbers   enable row level security;
alter table public.sending_windows enable row level security;
alter table public.campaigns       enable row level security;
alter table public.prospects       enable row level security;
alter table public.quotes          enable row level security;
alter table public.messages        enable row level security;
alter table public.inbound_emails  enable row level security;
alter table public.events          enable row level security;
alter table public.failed_jobs     enable row level security;

-- companies: the caller can see/update only their own company.
create policy company_rw on public.companies
  for all to authenticated
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

-- users: the caller can see rows in their company, and always their own row
-- (needed at signup before company_id is set).
create policy users_rw on public.users
  for all to authenticated
  using (auth_user_id = auth.uid() or company_id = public.current_company_id())
  with check (auth_user_id = auth.uid() or company_id = public.current_company_id());

-- company-scoped tables: single FOR ALL policy keyed on company_id.
do $$
declare t text;
begin
  foreach t in array array[
    'voice_profiles','phone_numbers','sending_windows','campaigns',
    'prospects','quotes','messages','inbound_emails','events','failed_jobs'
  ] loop
    execute format(
      'create policy %I_rw on public.%I
         for all to authenticated
         using (company_id = public.current_company_id())
         with check (company_id = public.current_company_id());', t, t);
  end loop;
end $$;
