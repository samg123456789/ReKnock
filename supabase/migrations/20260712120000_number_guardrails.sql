-- Number-purchase guardrails (founder directive 2026-07-12).

-- Hard limit: one live number per company, enforced by the database, not the
-- app (the app check alone is raceable). Released rows stay for audit and do
-- not block a company that cancels and later comes back.
create unique index if not exists phone_numbers_company_uq
  on public.phone_numbers (company_id) where status <> 'released';

-- Release lifecycle: a released number keeps its row (append-only audit of
-- what we paid for) but frees both uniqueness slots.
alter table public.phone_numbers drop constraint if exists phone_numbers_status_check;
alter table public.phone_numbers add constraint phone_numbers_status_check
  check (status in ('pending_10dlc','active','failed','released'));
alter table public.phone_numbers add column if not exists released_at timestamptz;

drop index if exists public.phone_numbers_e164_uq;
create unique index phone_numbers_e164_uq on public.phone_numbers (e164)
  where e164 is not null and status <> 'released';
