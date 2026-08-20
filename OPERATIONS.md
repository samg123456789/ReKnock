# OPERATIONS.md

Operational runbook for ReKnock. Read `CLAUDE.md` for the product/build spec.

## Environments

Two strictly separated environments (see CLAUDE.md section 1b).

| | Development | Production |
|---|---|---|
| Branch | `dev` (default working branch) | `main` (protected by discipline, see below) |
| URL | https://reknock-git-dev-re-knock.vercel.app (Vercel Preview) | getreknock.com (Vercel Production) |
| Supabase | `reknock-dev` (ref `hgmjkugxrsxxarjdgevc`, us-west-2) | production project |
| Stripe | test mode | live mode |
| Twilio | test creds / allowlisted numbers only (`DEV_SMS_ALLOWLIST`) | production creds |

**Vercel env vars are scoped by environment:** live keys on **Production** only; test keys on **Preview + Development** only. Never tick Production for a test key or Preview for a live key.

## Git workflow (standing rule, GitHub cannot enforce it on this plan)

- **Never push to `main` directly.** All work is committed and pushed to `dev`.
- `main` only updates when the founder opens a PR from `dev` and merges it himself in GitHub Desktop, after a phase passes its acceptance checks.
- Vercel deploys `main` → production automatically on merge; every push to `dev` → a fresh Preview deployment.

## Supabase migrations

The Supabase CLI is a dev dependency; run it with `npx supabase`. The repo is currently linked to **`reknock-dev`**.

Migrations live in `supabase/migrations/` and are checked into git.

```bash
# create a new migration file
npx supabase migration new <name>

# apply all checked-in migrations to the LINKED project (dev)
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push --linked

# see which migrations are applied on the linked project
SUPABASE_ACCESS_TOKEN=<token> npx supabase migration list --linked
```

Migrations reach **production** only after `dev` is merged to `main`. To apply
them to prod, re-link to the production project and push (do this from a clean
`main` checkout, right after merging):

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase link --project-ref <PROD_REF>
SUPABASE_ACCESS_TOKEN=<token> npx supabase db push --linked
# then re-link back to dev for daily work:
SUPABASE_ACCESS_TOKEN=<token> npx supabase link --project-ref hgmjkugxrsxxarjdgevc
```

Never edit tables by hand in the Supabase dashboard; always go through a migration so dev and prod stay identical.

## Secrets

- Personal access tokens and DB passwords never get committed. `.env*` and `supabase/.temp` are gitignored.
- All app secrets live in `.env.local` (local) and Vercel env vars (deployed). Keep `.env.example` current with every variable name.

## Runbook (filled in as phases ship)

- **Check failed jobs:** query the `failed_jobs` table (added in Phase 1+). _TODO: exact query + admin view._
- **Re-run a failed send:** _TODO (Phase 5)._
- **Where every webhook lives:** _TODO — Stripe `/api/webhooks/stripe`, Twilio `/api/webhooks/twilio`, Resend `/api/webhooks/resend`, Inngest `/api/inngest` (added per phase)._
- **Refund / cancel a customer:** via Stripe Customer Portal / dashboard (Phase 1). _TODO: exact steps._

## Phone numbers (Phase 3)

- Claiming: dashboard "Pick your ReKnock number" card -> `lib/provisioning-actions.ts`.
  Real Twilio purchases happen only on production with `ALLOW_NUMBER_PURCHASE=true`;
  everywhere else the claim is simulated (`tendlc_status.simulated=true`, no charge).
- New numbers sit in `pending_10dlc`. Outbound keeps using the shared Messaging
  Service pool until the number is flipped to `active`; then all sends and the
  inbound webhook pin to the tenant's own number.
- Flip to active after carrier registration clears (manual for now):
  `update phone_numbers set status='active' where e164='+1...';`
- 10DLC sole-prop submission via TrustHub API is NOT automated yet
  (`tendlc_status.state='not_submitted'`). Until then, register the number on
  the existing campaign in the Twilio console, then flip the status.

## Scheduled sends (engine v2, 2026-07-12)

- Every future send = `messages` row (status='scheduled', `scheduled_for`,
  kind sequence|reminder). Inngest `scheduled-send-dispatcher` cron (1 min)
  fans out; `send-scheduled-message` re-checks status/opt-out/cap/window at
  send time, claims the row (scheduled->queued, the idempotency lock), drafts,
  sends. Freeze = webhook/actions flip rows to 'canceled'; Resume re-arms them.
- Stuck rows: status='queued' with no `twilio_sid` and old `updated_at` means
  a crash mid-send. Never auto-retry these (the Twilio call may have gone
  out); check Twilio logs for the recipient, then mark the row 'failed' or
  'sent' by hand.
- Reminders: `reminders` table. remind_me -> owner ping + relay session at
  `remind_at`; auto_send -> linked scheduled messages row, same safety path.

## Number-purchase guardrails (2026-07-12)

- Real Twilio purchases require BOTH `VERCEL_ENV === "production"` and
  `ALLOW_NUMBER_PURCHASE=true`; anything else simulates. A typo in either
  var fails safe (simulated).
- Postgres enforces one live number per company
  (`phone_numbers_company_uq`) and platform-unique e164; claiming also
  requires a trialing/active, non-suspended subscription.
- Every real purchase/release writes `events` + emails platform admins
  (lib/notify-admin.ts; falls back to the events row if Resend fails).
- Cancel path: `customer.subscription.deleted` -> Inngest
  `company/numbers.release` -> Twilio DELETE + rows marked `released`.
- Reconciliation: `number-reconciliation` runs Mondays 13:00 UTC and on the
  `admin/reconcile.requested` event. Diffs Twilio's number list vs live
  rows/companies; flags orphans, unreleased-on-canceled, dangling rows.
  Shared pool numbers listed in `TWILIO_SHARED_NUMBERS` are exempt.
  Results land in `admin.number_reconciliation` events; issues also email
  the admins.

## Deliverability + relay reliability (2026-07-12 hardening pass)

- Delivery-status callbacks: every Twilio send passes `StatusCallback` ->
  `/api/webhooks/twilio/status` (signature-verified). Terminal verdicts land
  on the ledger row: 'delivered', or 'failed' with
  `send_meta.delivery_error_code`. Requires `APP_URL` to be the public https
  URL of the deployment (set per Vercel env; localhost skips the callback).
- Health query (no dashboard; run in Supabase SQL):
  ```sql
  select send_meta->>'delivery_error_code' as code, count(*)
  from messages
  where status = 'failed' and send_meta ? 'delivery_error_code'
    and created_at > now() - interval '7 days'
  group by 1 order by 2 desc;
  ```
  30007 = carrier filtering (content/trust score problem, act on a spike;
  each one also writes a `delivery_filtered` event). 30003/30005/30006 =
  handset unreachable/invalid (bad lead numbers). 30034 = unregistered
  sender (10DLC association broken).
- Send pacing: enrollment adds 0-10 min of jitter to morning slots and later
  touches; window-deferred sends get jitter too. Hard floor of 2h between
  automated sends to the same homeowner, enforced at send time (prod only).
- Relay/owner-ping failures are NOT silent: a Twilio failure enqueues
  `sms/retry.requested` -> Inngest `retry-sms-delivery` (3 retries with
  backoff, failed->queued claim prevents double-send). Final failure writes
  `failed_jobs` + a `relay_delivery_failed` event and emails the admins.
- STOP/HELP handling is custom-parsed in the inbound webhook with the
  carrier-registered exact reply strings. VERIFY IN TWILIO CONSOLE which
  opt-out mode the Messaging Service uses: if Twilio's default opt-out is
  active it will blacklist the number AND send its own canned reply, so our
  confirmation would 21610-fail (double-reply risk / wrong copy). Correct
  setup: Advanced Opt-Out enabled with response strings matching the
  registered copy, or Twilio default responses disabled so ours are the only
  ones. Keep our webhook parsing either way (it is what cancels sends + sets
  opted_out in the DB).
- Freeze race is covered by `scripts/freeze-race-test.mjs` (runs the real
  claim/freeze SQL against dev concurrently; needs SUPABASE_ACCESS_TOKEN).

## Flexible timelines (2026-07-12 pm)

- A prospect's timeline = their scheduled `messages` rows. Each row snapshots
  step_intent/step_template at enrollment; `body` + `body_is_custom=true`
  means the contractor's own text sends verbatim (compliance line still
  enforced). Move = update scheduled_for; delete = status 'canceled' with
  send_meta.reason 'user_delete' (Resume never re-arms those); extra touches
  are rows with sequence_step null and idempotency_key 'extra:{uuid}'.
- `sequence_overrides` is retired (table kept for audit; nothing reads it).
- The /campaign editor only shapes NEW enrollments; editing it does not
  rewrite already-scheduled rows.

## Production cutover runbook (updated 2026-07-13, after the hardening + intake + growth passes)

Founder merges dev -> main in GitHub Desktop; everything else in order:

1. **Supabase (prod project)**: apply ALL unapplied migrations in `supabase/migrations/` (through `20260713233000_growth_basics`). Today's five: feature_tour_column, relay_cell_verification, shared_email_intake, level2_agent, growth_basics.
2. **Vercel Production env**: `APP_URL=https://getreknock.com` (already set, type sensitive - build hard-fails if wrong), `RESEND_API_KEY` (founder mints a PROD key, name it `reknock-app-prod`), `RESEND_WEBHOOK_SECRET` (from step 4), `TWILIO_SHARED_NUMBERS`, leave `ALLOW_NUMBER_PURCHASE` unset.
3. **Inngest**: `curl -X PUT https://getreknock.com/api/inngest` after first prod deploy (11 functions).
4. **Resend**: create a SECOND webhook (email.received -> https://getreknock.com/api/webhooks/resend) with the prod key; keep the preview webhook separate. The receiving MX is domain-wide and already live.
5. **Twilio (PROD account)**: confirm the A2P campaign is APPROVED (dev campaign status does not transfer); point the prod number's inbound SMS webhook, status callback, and voice webhook at getreknock.com routes; verify Advanced Opt-Out config.
6. **Stripe**: live-mode webhook at prod URL (already configured per earlier setup; verify secret matches env).
7. **Smoke**: signup -> onboard -> add quote (touch schedules day-spaced, NOT minutes: testMode is off) -> the 2h min-gap and quiet hours are ACTIVE on prod. First real onboarding fires drip email 1/5 an hour in.
8. **Watch**: `failed_jobs`, `events` (delivery_filtered, relay_delivery_failed, incoming_call_missed, incoming_call_unrouted), CI stays green on PRs to main (freeze-race + loop-guard tripwires).

## Email intake ops
- Inbound webhook on/off: PATCH https://api.resend.com/webhooks/{id} {"status":"enabled"|"disabled"} with the Resend key. Disabling is the loop kill switch; mail continues to be stored by Resend while off.
- Loop protection: four layers in processInboundEmail (forwarder-identity, X-ReKnock-Forwarded marker, 15-per-10min circuit breaker w/ admin email, off-domain destinations only) + CI static tripwire.
- Unmatched senders: inbound_emails.resolution='unmatched' (never dropped). Sender allowlist per company: company_sender_emails (login email seeded; extras verify by emailed link).
- Founder-voiced automated email: onboarding drip (5, hours 1/48/120/192/288), testimonial ask (first Won, once ever), monthly ROI report (1st, 14:00 UTC), setup reminder (daily 15:00 UTC, once ever). All skip is_internal + suspended; all reply to sam@ which catch-all-forwards to the founder.
