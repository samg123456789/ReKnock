-- Relay-cell OTP: the relay cell receives homeowners' reply threads, so an
-- unverified (typo'd) number means a stranger gets someone else's leads. A
-- 6-digit SMS code must confirm the number before it becomes the live relay
-- target. Numbers saved before verification existed are grandfathered.
alter table public.users
  add column if not exists cell_phone_verified_at timestamptz,
  add column if not exists pending_cell_phone text,
  add column if not exists pending_cell_code_hash text,
  add column if not exists pending_cell_expires_at timestamptz,
  add column if not exists pending_cell_attempts int not null default 0;

update public.users
set cell_phone_verified_at = now()
where cell_phone is not null and cell_phone_verified_at is null;
