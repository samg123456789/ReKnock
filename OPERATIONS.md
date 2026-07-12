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
