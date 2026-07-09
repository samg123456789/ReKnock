-- ============================================================
-- QUOTECHASER (working name) — Postgres schema v1
-- Target: Supabase/Neon Postgres. One database, multi-tenant.
-- Design invariants:
--   1. Every tenant-owned table carries tenant_id. RLS enforced.
--   2. messages is an APPEND-ONLY ledger. Never UPDATE body/direction. 
--      Status transitions only (queued -> sent -> delivered/failed).
--   3. Consent lives on the CONTACT, quote outcome lives on the QUOTE.
--      They are never the same flag.
--   4. Idempotency: every outbound send carries a unique idempotency_key.
-- ============================================================

-- ---------- ENUMS ----------
create type tenant_status as enum ('onboarding','trialing','active','past_due','canceled');
create type provisioning_status as enum ('not_started','submitted','active','failed');
create type quote_status as enum ('draft','sequencing','frozen_replied','won','lost','deferred','exhausted');
create type quote_source as enum ('manual','email_parse','zapier','api');
create type msg_direction as enum ('outbound','inbound');
create type msg_status as enum ('queued','sent','delivered','failed','suppressed');
create type consent_status as enum ('unknown','granted','revoked');
create type reply_category as enum ('buying_signal','question_objection','not_now','lost','opt_out','confusion','other');
create type notif_channel as enum ('sms','email');

-- ---------- TENANTS (the contractor account) ----------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status tenant_status not null default 'onboarding',

  -- identity
  business_name text not null,
  legal_name text,                          -- required for 10DLC submission
  ein text,                                 -- required for 10DLC submission
  trade text,                               -- 'roofing','painting','fencing',...
  owner_name text not null,
  owner_phone text not null,                -- E.164; where relay pings go
  owner_email text not null,
  timezone text not null default 'America/New_York',

  -- messaging infra
  twilio_number text,                       -- dedicated local number, E.164
  tcr_brand_id text,                        -- 10DLC brand (ISV sub-brand)
  tcr_campaign_id text,                     -- 10DLC campaign
  provisioning provisioning_status not null default 'not_started',

  -- AI voice profile: output of onboarding interview.
  -- { formality, sign_off, phrases_to_use[], phrases_to_avoid[], sample_rewrite }
  voice_profile jsonb not null default '{}'::jsonb,

  -- billing (Stripe is source of truth; these are mirrors)
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_outbound_limit int not null default 50,   -- $1/wk trial cap: outbound msgs to prospects
  trial_outbound_used int not null default 0,

  -- founder review gate (removable later): first sequence copy approved?
  sequences_approved boolean not null default false,

  -- Zapier / API access
  api_key_hash text unique                  -- store hash only; show key once at creation
);

-- ---------- CONTACTS (the homeowner / prospect) ----------
create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  created_at timestamptz not null default now(),

  name text,
  phone text not null,                      -- E.164
  email text,
  timezone text,                            -- default: tenant's tz at send time

  -- CONSENT: independent of any quote outcome (invariant #3)
  sms_consent consent_status not null default 'unknown',
  consent_source text,                      -- 'quote_form','verbal_confirmed','import'
  consent_at timestamptz,
  opted_out_at timestamptz,

  unique (tenant_id, phone)
);

-- ---------- SEQUENCES (templates, per tenant, usually per trade) ----------
create table sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,                       -- 'Default roofing follow-up'
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table sequence_touches (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  touch_number int not null,                -- 1..4
  delay_days int not null,                  -- days after quote sent_at (touch 1) or previous touch
  template_text text not null,              -- may contain {first_name},{amount},{job_type},{owner_name}
  unique (sequence_id, touch_number)
);

-- ---------- QUOTES ----------
create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  created_at timestamptz not null default now(),

  source quote_source not null,
  external_ref text,                        -- Zapier/Jobber id if any
  amount_cents bigint,
  job_type text,                            -- 'roof replacement','exterior paint',...
  description text,
  quote_sent_at timestamptz,                -- when contractor sent the quote to prospect

  status quote_status not null default 'draft',
  sequence_id uuid references sequences(id),
  current_touch int not null default 0,     -- last touch sent
  next_touch_at timestamptz,                -- denormalized for dashboard; queue is source of truth
  frozen_at timestamptz,
  freeze_reason text,                       -- 'inbound_reply','manual','opt_out','trial_cap'
  closed_at timestamptz,
  deferred_until date,                      -- 'call me in spring'

  constraint frozen_needs_reason check (frozen_at is null or freeze_reason is not null)
);

create index quotes_tenant_status on quotes (tenant_id, status);
create index quotes_next_touch on quotes (next_touch_at) where status = 'sequencing';

-- ---------- MESSAGES (append-only ledger; invariant #2 & #4) ----------
create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  quote_id uuid references quotes(id),      -- nullable: relay msgs may attach later
  contact_id uuid references contacts(id),
  created_at timestamptz not null default now(),

  direction msg_direction not null,
  from_number text not null,
  to_number text not null,
  body text not null,
  touch_number int,                         -- set for automated sequence sends
  is_relay boolean not null default false,  -- contractor-authored via relay

  status msg_status not null default 'queued',
  provider_sid text unique,                 -- Twilio SID
  idempotency_key text unique,              -- e.g. 'touch:{quote_id}:{touch_number}'
  sent_at timestamptz,
  delivered_at timestamptz,
  error_code text
);

create index messages_thread on messages (tenant_id, contact_id, created_at);

-- ---------- REPLY CLASSIFICATION (Haiku output; suggestion never auto-sends) ----------
create table reply_classifications (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) unique,
  tenant_id uuid not null references tenants(id),
  category reply_category not null,
  confidence numeric(3,2) not null,         -- 0.00-1.00; below threshold => treat as 'other'
  suggested_reply text,                     -- drafted in tenant voice; human sends or ignores
  model text not null,                      -- e.g. 'claude-haiku-4-5-20251001'
  created_at timestamptz not null default now()
);

-- ---------- RELAY SESSIONS (route contractor's plain-text replies) ----------
-- When we ping the owner about a reply, we open a session. Owner's next
-- inbound text from owner_phone routes to session's contact. New ping
-- supersedes old session; if 2+ sessions open, ping includes '1)/2)' prefix rule.
create table relay_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  contact_id uuid not null references contacts(id),
  quote_id uuid references quotes(id),
  opened_at timestamptz not null default now(),
  expires_at timestamptz not null,          -- opened_at + 24h
  closed_at timestamptz
);
create index relay_open on relay_sessions (tenant_id, expires_at) where closed_at is null;

-- ---------- WEBHOOK EVENTS (raw front door; persist first, ack fast, process async) ----------
create table webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                   -- 'twilio','stripe','zapier','postmark'
  received_at timestamptz not null default now(),
  payload jsonb not null,
  signature_valid boolean,
  processed_at timestamptz,
  process_error text
);
create index webhooks_unprocessed on webhook_events (received_at) where processed_at is null;

-- ---------- EVENTS (append-only analytics/audit; your only 'analytics infra') ----------
create table events (
  id bigint generated always as identity primary key,
  tenant_id uuid,
  type text not null,   -- 'quote.created','touch.sent','reply.received','quote.won',
                        -- 'trial.cap_hit','consent.revoked','relay.sent', ...
  quote_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index events_tenant_type on events (tenant_id, type, created_at);

-- ---------- OUTBOUND ZAPIER SUBSCRIPTIONS (REST hooks) ----------
create table zapier_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  event_type text not null,                 -- 'quote.replied','quote.won','quote.lost'
  target_url text not null,
  created_at timestamptz not null default now()
);

-- ---------- ROW LEVEL SECURITY (belt & suspenders on top of app scoping) ----------
alter table contacts enable row level security;
alter table quotes enable row level security;
alter table messages enable row level security;
alter table sequences enable row level security;
alter table sequence_touches enable row level security;
alter table reply_classifications enable row level security;
alter table relay_sessions enable row level security;
alter table zapier_subscriptions enable row level security;
-- Policies: app role sets `set_config('app.tenant_id', ...)` per request;
-- policy example (repeat per table):
-- create policy tenant_isolation on quotes
--   using (tenant_id = current_setting('app.tenant_id')::uuid);

-- ============================================================
-- QUOTE STATE MACHINE (enforce in app code, single transition fn)
--
--  draft ──activate──► sequencing ──inbound reply──► frozen_replied
--    │                     │  │                          │
--    │                     │  └─all touches sent──► exhausted
--    │                     └─trial cap──freeze (stay sequencing, frozen_at set)
--    └───────────────► won | lost   (from any state, manual)
--  frozen_replied ──manual──► won | lost | deferred | sequencing (re-arm)
--  deferred ──deferred_until reached──► sequencing (new gentle touch)
--
-- HARD RULES:
--  * inbound reply => cancel all pending queue jobs for (tenant, contact)
--    AND set frozen_at IN THE SAME TRANSACTION. Never two steps.
--  * contact.sms_consent = 'revoked' => suppress ALL sends to that contact
--    across ALL quotes, forever, regardless of quote status.
--  * opt-out (STOP) is NOT quote.lost. Set consent revoked; freeze quote
--    with reason 'opt_out'; owner decides won/lost manually.
-- ============================================================
