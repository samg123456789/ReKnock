-- Monthly quote allowance. This is an account-level ledger so usage cannot be
-- bypassed by deleting a quote or by sending two imports at the same time.
create table if not exists public.company_monthly_quote_usage (
  company_id uuid not null references public.companies(id) on delete cascade,
  period_start date not null,
  quote_count integer not null default 0 check (quote_count >= 0),
  email_50_sent boolean not null default false,
  email_75_sent boolean not null default false,
  email_90_sent boolean not null default false,
  email_100_sent boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, period_start)
);

-- Backfill existing quotes so a customer cannot get a fresh allowance merely
-- because the ledger was introduced after their account already had activity.
insert into public.company_monthly_quote_usage (company_id, period_start, quote_count)
select company_id, date_trunc('month', created_at)::date, count(*)::integer
from public.prospects
group by company_id, date_trunc('month', created_at)::date
on conflict (company_id, period_start) do update
set quote_count = excluded.quote_count,
    updated_at = now();

create trigger company_monthly_quote_usage_set_updated_at
before update on public.company_monthly_quote_usage
for each row execute function public.set_updated_at();

alter table public.company_monthly_quote_usage enable row level security;
create policy company_monthly_quote_usage_read
on public.company_monthly_quote_usage
for select to authenticated
using (company_id = public.current_company_id());

-- Every new quote passes through this trigger, including manual entry, CSV,
-- and forwarded-email intake. The transaction rolls back if the allowance is
-- full, so a rejected insert does not consume capacity.
create or replace function public.enforce_monthly_quote_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  period date := date_trunc('month', now())::date;
  next_count integer;
begin
  insert into public.company_monthly_quote_usage (company_id, period_start, quote_count)
  values (new.company_id, period, 1)
  on conflict (company_id, period_start) do update
    set quote_count = public.company_monthly_quote_usage.quote_count + 1,
        updated_at = now()
    where public.company_monthly_quote_usage.quote_count < 100
  returning quote_count into next_count;

  if next_count is null then
    raise exception 'monthly_quote_limit_reached'
      using errcode = 'P0001',
            detail = 'The Starter account has reached its monthly quote allowance.';
  end if;

  return new;
end;
$$;

drop trigger if exists prospects_monthly_quote_limit on public.prospects;
create trigger prospects_monthly_quote_limit
after insert on public.prospects
for each row execute function public.enforce_monthly_quote_limit();
