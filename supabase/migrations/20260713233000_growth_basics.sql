-- Growth basics: referral codes, referral attribution, and signup source
-- (UTM/first-touch) capture. Additive only; nothing in the send pipeline.
alter table public.companies
  add column if not exists referral_code text unique default substr(md5(gen_random_uuid()::text), 1, 8),
  add column if not exists referred_by_code text,
  add column if not exists signup_source jsonb;

update public.companies
set referral_code = substr(md5(id::text || 'reknock-ref'), 1, 8)
where referral_code is null;
