-- Internal/test accounts (founder, staff, demo). Excluded from the
-- founding-member counter and any customer-facing metrics.

alter table public.companies
  add column if not exists is_internal boolean not null default false;
