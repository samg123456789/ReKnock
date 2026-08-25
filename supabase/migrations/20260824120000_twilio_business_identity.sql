-- Twilio/TCR business identity collected per customer for ISV A2P 10DLC
-- registration. Tax IDs are encrypted by the app before storage; never store
-- SSNs because a sole proprietor without an EIN uses the Sole Proprietor path.
alter table public.companies
  add column if not exists legal_name text,
  add column if not exists brand_name text,
  add column if not exists business_type text,
  add column if not exists has_tax_id boolean,
  add column if not exists tax_id_type text,
  add column if not exists tax_id_encrypted text,
  add column if not exists business_industry text,
  add column if not exists business_address_street text,
  add column if not exists business_address_street2 text,
  add column if not exists business_address_city text,
  add column if not exists business_address_region text,
  add column if not exists business_address_postal_code text,
  add column if not exists business_address_country text default 'US',
  add column if not exists social_media_urls text[],
  add column if not exists business_regions_of_operation text[],
  add column if not exists authorized_first_name text,
  add column if not exists authorized_last_name text,
  add column if not exists authorized_title text,
  add column if not exists authorized_job_position text,
  add column if not exists authorized_phone text,
  add column if not exists brand_contact_email text,
  add column if not exists twilio_compliance_status text default 'not_started',
  add column if not exists twilio_campaign_description text,
  add column if not exists twilio_message_flow text,
  add column if not exists twilio_message_samples jsonb,
  add column if not exists twilio_customer_profile_sid text,
  add column if not exists twilio_trust_product_sid text,
  add column if not exists twilio_brand_registration_sid text,
  add column if not exists twilio_campaign_sid text,
  add column if not exists twilio_messaging_service_sid text,
  add column if not exists twilio_registration_error text,
  add column if not exists twilio_registration_updated_at timestamptz;

alter table public.companies drop constraint if exists companies_business_type_check;
alter table public.companies add constraint companies_business_type_check
  check (business_type is null or business_type in ('sole_proprietor','llc','corporation','partnership','other'));

alter table public.companies drop constraint if exists companies_twilio_compliance_status_check;
alter table public.companies add constraint companies_twilio_compliance_status_check
  check (twilio_compliance_status is null or twilio_compliance_status in ('not_started','needs_ein','profile_ready','submitted','approved','needs_review'));
