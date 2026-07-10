-- Billing + company-at-signup adjustments (Phase 1).
--
-- A company now exists from signup (single-owner MVP), so Stripe billing has a
-- row to attach to before onboarding runs. Descriptive fields (name, trade, ...)
-- are filled during onboarding. subscription_status is null until the user pays;
-- onboarded_at marks onboarding completion for the paywall router.

alter table public.companies
  alter column name drop not null,
  alter column subscription_status drop default,
  alter column subscription_status drop not null,
  add column if not exists stripe_subscription_id text,
  add column if not exists onboarded_at timestamptz;

create unique index if not exists companies_stripe_customer_id_uq
  on public.companies (stripe_customer_id) where stripe_customer_id is not null;

-- Recreate the signup handler to also provision the company and link the user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  insert into public.companies (forwarding_slug)
  values ('c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))
  returning id into v_company_id;

  insert into public.users (auth_user_id, company_id, full_name, email_confirmed_at)
  values (new.id, v_company_id, new.raw_user_meta_data->>'full_name', new.email_confirmed_at)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;
