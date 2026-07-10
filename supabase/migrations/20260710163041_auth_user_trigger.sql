-- Auto-create a public.users row when a Supabase auth user signs up.
-- Runs as SECURITY DEFINER so it bypasses RLS. company_id stays null until
-- onboarding creates the company (Phase 2).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.users (auth_user_id, full_name, email_confirmed_at)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email_confirmed_at
  )
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep public.users.email_confirmed_at in sync when the user confirms.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email_confirmed_at is distinct from old.email_confirmed_at then
    update public.users
      set email_confirmed_at = new.email_confirmed_at
      where auth_user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update on auth.users
  for each row execute function public.handle_user_confirmed();
