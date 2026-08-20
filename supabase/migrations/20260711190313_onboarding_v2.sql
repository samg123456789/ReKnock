-- Onboarding v2: multi-trade, website-inferred fields, and 10DLC consent tracking.

-- companies: multi-select trades + inferred/business-tuning fields.
alter table public.companies
  add column if not exists trades text[],
  add column if not exists heard_about text,
  add column if not exists avg_quote_amount numeric(12,2),
  add column if not exists quotes_per_month int;

-- trade is now app-controlled (UI is a searchable multi-select incl. general
-- contractor; trades[0] is mirrored into trade for back-compat).
alter table public.companies drop constraint if exists companies_trade_check;

-- 10DLC: we only message prospects whose consent path is recorded
-- (see CLAUDE.md "SMS compliance"). Existing rows keep null until captured.
alter table public.prospects
  add column if not exists consent_path text
    check (consent_path in ('verbal_at_quote', 'web_form')),
  add column if not exists consent_captured_at timestamptz;
