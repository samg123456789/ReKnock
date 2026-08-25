-- Preview/development signup accounts are marked internal so test checkout
-- runs never consume one of the 20 founding customer spots. Production ignores
-- the client-side flag because the form never sends it there.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
begin
  insert into public.companies (forwarding_slug, is_internal)
  values (
    'c_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
    coalesce((new.raw_user_meta_data->>'reknock_test_account')::boolean, false)
  )
  returning id into v_company_id;

  insert into public.users (auth_user_id, company_id, full_name, email_confirmed_at)
  values (new.id, v_company_id, new.raw_user_meta_data->>'full_name', new.email_confirmed_at)
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;
