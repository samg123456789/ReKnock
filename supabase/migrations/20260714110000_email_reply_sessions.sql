-- Email reply-to-SMS bridge. When a homeowner replies, ReKnock emails the
-- contractor with Reply-To: reply+token@getreknock.com. Any reply to that
-- email is routed back to the homeowner as an SMS and logged in the thread.
create table if not exists public.email_reply_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  owner_email text not null,
  token text not null unique,
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists email_reply_sessions_token_idx
  on public.email_reply_sessions (token);
create index if not exists email_reply_sessions_company_idx
  on public.email_reply_sessions (company_id, created_at desc);

create trigger email_reply_sessions_set_updated_at before update on public.email_reply_sessions
  for each row execute function public.set_updated_at();

alter table public.email_reply_sessions enable row level security;
create policy email_reply_sessions_rw on public.email_reply_sessions
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

alter table public.inbound_emails drop constraint if exists inbound_emails_resolution_check;
alter table public.inbound_emails add constraint inbound_emails_resolution_check
  check (resolution in (
    'new_prospect',
    'updated_prospect',
    'needs_review',
    'ignored',
    'unmatched',
    'reply_forwarded',
    'reply_blocked'
  ));
