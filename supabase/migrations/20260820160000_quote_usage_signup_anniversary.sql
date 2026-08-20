-- Quote allowances renew on the company's monthly anniversary. This avoids
-- an arbitrary first-of-month reset while keeping the allowance predictable.
create or replace function public.quote_period_start(
  p_company_id uuid,
  p_on date default current_date
)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  anchor date;
  month_offset integer;
  target_month date;
  candidate date;
  day_in_target integer;
begin
  select created_at::date into anchor
  from public.companies
  where id = p_company_id;

  anchor := coalesce(anchor, p_on);
  month_offset := (extract(year from p_on)::integer - extract(year from anchor)::integer) * 12
    + extract(month from p_on)::integer - extract(month from anchor)::integer;
  target_month := (date_trunc('month', anchor)::date + make_interval(months => month_offset))::date;
  day_in_target := extract(day from (target_month + interval '1 month - 1 day'))::integer;
  candidate := target_month + (least(extract(day from anchor)::integer, day_in_target) - 1);

  if candidate > p_on then
    month_offset := month_offset - 1;
    target_month := (date_trunc('month', anchor)::date + make_interval(months => month_offset))::date;
    day_in_target := extract(day from (target_month + interval '1 month - 1 day'))::integer;
    candidate := target_month + (least(extract(day from anchor)::integer, day_in_target) - 1);
  end if;

  return candidate;
end;
$$;

-- Re-key any rows created by the first version of the ledger from calendar
-- months to the account anniversary periods.
delete from public.company_monthly_quote_usage;
insert into public.company_monthly_quote_usage (
  company_id,
  period_start,
  quote_count,
  email_50_sent,
  email_75_sent,
  email_90_sent,
  email_100_sent
)
select
  company_id,
  public.quote_period_start(company_id, created_at::date),
  count(*)::integer,
  count(*) >= 50,
  count(*) >= 75,
  count(*) >= 90,
  count(*) >= 100
from public.prospects
group by company_id, public.quote_period_start(company_id, created_at::date);

create or replace function public.enforce_monthly_quote_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  period date := public.quote_period_start(new.company_id);
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
