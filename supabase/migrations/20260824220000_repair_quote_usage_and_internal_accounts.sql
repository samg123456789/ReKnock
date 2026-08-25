-- Repair the known orphaned ledger row discovered during production testing.
-- This company has no prospect rows, but its current-period ledger says 100.
update public.company_monthly_quote_usage
set quote_count = 0,
    email_50_sent = false,
    email_75_sent = false,
    email_90_sent = false,
    email_100_sent = false,
    updated_at = now()
where company_id = '9e46d097-ef12-47f6-aa4b-1a407c50d9ac'
  and period_start = '2026-08-10'
  and not exists (
    select 1
    from public.prospects p
    where p.company_id = company_monthly_quote_usage.company_id
      and p.created_at::date >= company_monthly_quote_usage.period_start
  );

-- Internal preview/test accounts must never consume customer quote allowance.
create or replace function public.enforce_monthly_quote_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  period date := public.quote_period_start(new.company_id);
  next_count integer;
  internal_account boolean;
begin
  select coalesce(is_internal, false)
    into internal_account
  from public.companies
  where id = new.company_id;

  if internal_account then
    return new;
  end if;

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
