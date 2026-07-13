-- Shared quote-intake address (quotes@getreknock.com): inbound mail is matched
-- to a company by VERIFIED sender email (Ramp receipts@ style) instead of a
-- per-tenant address. A contractor can register several senders (personal +
-- business). Mail from an unrecognized sender is stored as 'unmatched', never
-- silently dropped.

create table if not exists public.company_sender_emails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null, -- always stored lowercased
  verified_at timestamptz,
  verify_token text
);
-- One company per sender address: matching must be deterministic.
create unique index if not exists company_sender_emails_email_uq on public.company_sender_emails (email);
create index if not exists company_sender_emails_company_idx on public.company_sender_emails (company_id);

alter table public.company_sender_emails enable row level security;
create policy sender_emails_rw on public.company_sender_emails
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Seed: each company's login email is already confirmed by Supabase auth.
insert into public.company_sender_emails (company_id, email, verified_at)
select u.company_id, lower(u.email), now()
from public.users u
where u.email is not null and u.company_id is not null
on conflict (email) do nothing;

-- Unmatched mail has no company; store it anyway (auditability + support).
alter table public.inbound_emails alter column company_id drop not null;
alter table public.inbound_emails drop constraint if exists inbound_emails_resolution_check;
alter table public.inbound_emails add constraint inbound_emails_resolution_check
  check (resolution in ('new_prospect','updated_prospect','needs_review','ignored','unmatched'));
-- Raw webhook payload, persisted before any processing (invariant 6).
alter table public.inbound_emails add column if not exists raw jsonb;
