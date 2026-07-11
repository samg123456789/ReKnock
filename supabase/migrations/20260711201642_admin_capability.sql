-- Platform admin: a capability on the founder's normal user, plus an email
-- column on public.users for the admin dashboard (avoids auth-schema joins).

alter table public.users
  add column if not exists platform_admin boolean not null default false,
  add column if not exists email text;

-- Backfill email for existing users from auth.
update public.users u
  set email = au.email
  from auth.users au
  where au.id = u.auth_user_id and u.email is null;

-- Seed the single admin (no-op if that account does not exist yet).
update public.users u
  set platform_admin = true
  from auth.users au
  where au.id = u.auth_user_id and lower(au.email) = 'samuelgoldberg98@gmail.com';

-- Recreate the signup handler to also store email and auto-grant admin to the
-- seed address if that account signs up later.
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

  insert into public.users (auth_user_id, company_id, full_name, email, email_confirmed_at, platform_admin)
  values (
    new.id,
    v_company_id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.email_confirmed_at,
    lower(new.email) = 'samuelgoldberg98@gmail.com'
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;
