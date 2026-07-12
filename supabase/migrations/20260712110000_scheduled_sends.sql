-- Scheduled-send engine (per-step scheduled messages rows + reminders + relay
-- sessions). Replaces the single Inngest sleepUntil loop: every future send is
-- a `messages` row with status='scheduled' and a `scheduled_for`, evaluated at
-- send time (status/opt-out/cap/window checked when it fires, not when it was
-- scheduled). This also makes Resume real: canceled rows get re-armed.

-- 1. messages.kind: what class of outbound this row is.
--    sequence/reminder/manual/relay are homeowner-facing; owner_ping rows go
--    to the contractor's own cell (reply notifications, reminder nudges) and
--    are hidden from the prospect thread; system = carrier keyword replies.
alter table public.messages
  add column if not exists kind text not null default 'manual'
    check (kind in ('sequence','reminder','manual','relay','owner_ping','system'));

update public.messages set kind = 'sequence' where sequence_step is not null;
update public.messages set kind = 'owner_ping'
  where idempotency_key like 'relay:%';
update public.messages set kind = 'system'
  where idempotency_key like 'optout-confirm:%' or idempotency_key like 'help:%';

-- 2. Allow 'canceled' (freeze/skip) as a terminal status. Append-only ledger:
-- rows are never deleted, a canceled touch stays visible as history.
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages add constraint messages_status_check
  check (status in ('queued','scheduled','sent','delivered','failed','received','canceled'));

-- Why a send was skipped/canceled/rescheduled (freeze, opt_out, trial_cap...).
alter table public.messages
  add column if not exists send_meta jsonb;

-- 3. Reminders ("circle back in March"). Registered 10DLC behavior.
--    remind_me: at remind_at, ping the contractor's cell with a nudge.
--    auto_send: an AI-drafted message (kind='reminder' messages row, linked
--    via message_id) sends automatically at remind_at, windows/opt-out
--    checked at send time.
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  remind_at timestamptz not null,
  mode text not null check (mode in ('remind_me','auto_send')),
  note text,
  message_id uuid references public.messages(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','fired','canceled'))
);
create index if not exists reminders_due_idx on public.reminders (status, remind_at);
create index if not exists reminders_prospect_idx on public.reminders (prospect_id, status);
create trigger reminders_set_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();
alter table public.reminders enable row level security;
create policy reminders_rw on public.reminders
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- 4. Relay sessions: whenever we text the contractor about a prospect (reply
-- relay or reminder ping), open a session so their inbound reply routes back
-- to that homeowner. 24h expiry. Newest session wins; "1)" prefix picks older.
create table if not exists public.relay_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prospect_id uuid not null references public.prospects(id) on delete cascade,
  owner_phone text not null,
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists relay_sessions_owner_idx on public.relay_sessions (owner_phone, expires_at desc);
create trigger relay_sessions_set_updated_at before update on public.relay_sessions
  for each row execute function public.set_updated_at();
alter table public.relay_sessions enable row level security;
create policy relay_sessions_rw on public.relay_sessions
  for all to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- 5. Inbound webhook routes by the To number, so a tenant's number must be
-- unique across the platform.
create unique index if not exists phone_numbers_e164_uq
  on public.phone_numbers (e164) where e164 is not null;
