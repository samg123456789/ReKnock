# Production cutover runbook (dev to main)

Status: PLAN ONLY. Nothing here has been executed. The founder runs the cutover
in GitHub Desktop and the vendor consoles when ready. Written 2026-07-17.

## What this cutover actually is

`main` (production, getreknock.com) is currently 131 commits behind `dev`. Today
production serves ONLY the marketing + legal shell: homepage, /pricing, /blog,
/login, /signup, /privacy, /terms, robots/sitemap. The entire ReKnock application
(auth flows that work, onboarding, the sequencing engine, inbox, quote intake,
the consent flow, and the /sms-terms page) has never been deployed to production.

So this is not a routine "ship a few files" merge. It is the FIRST production
launch of the whole app. Treat it as a launch, not a patch.

## BEFORE you merge: two blockers to resolve

### Blocker 1 (legal): the pending consent wording will ship

A dev to main merge carries EVERY change on dev, including the DRAFT consent
wording still pending Sam's legal answer. There is no way to ship the structural
consent fixes without also shipping the draft wording, because they live on the
same branch. The wording is isolated into three flagged artifacts (each carries a
`LEGAL REVIEW PENDING` comment in the code):

1. Single-quote checkbox attestation: `CONSENT_ATTESTATION_SINGLE` in
   `lib/consent.ts`, rendered in `components/app/AddQuoteForm.tsx`.
2. Bulk checkbox attestation: `CONSENT_ATTESTATION_BULK` in `lib/consent.ts`,
   rendered in `components/app/CsvImport.tsx`.
3. Verbal script / CTA copy: `CONSENT_LANGUAGE` and the "How you opt in" section
   in `app/sms-terms/page.tsx`.

Introduced across commits `a4e425f`, `1276447`. NOTE (verified 2026-07-17):
there is NO prior legally-cleared version to "revert" to. The single-quote
checkbox and the entire /sms-terms page are net-new in this batch (no earlier
version exists); only the bulk CSV attestation had an earlier dev-only line
("I have permission to text these customers about their quotes."), which was
itself never formally cleared. So the only paths are:
  (a) author + get legal sign-off on the exact wording, set the three
      constants / the page copy to the approved strings on dev, THEN cut over; or
  (b) cut over with the drafts as-is only if legal has signed off on them as-is.

KEEP regardless (structural, already separated, commit `0ff8ebc`): the Path 2
(unverifiable web-form opt-in) removal and the cross-linking
(`CONSENT_LINK_HREF`/`CONSENT_LINK_LABEL` -> /sms-terms). These are not part of
the legal hold.

Founder decision 2026-07-17: leave the drafts on dev as-is (do not guess at
wording); finalize before cutover. Do NOT merge to main until the wording is
signed off.

### Blocker 2 (git): the legal pages WILL conflict on merge

`main` has commit `fa04294` ("Add /terms and 10DLC-compliant /privacy") that
`dev` does not have, and `dev` edited the same two files independently. A dev to
main merge produces two conflicts (verified with `git merge-tree`):

- `app/privacy/page.tsx` (content conflict)
- `app/terms/page.tsx` (add/add conflict)

Resolution: take the `dev` version of BOTH files. The dev versions are the
current copies and they link to /sms-terms; the production hotfix versions do
not. After resolving, confirm the footer links (`components/Footer.tsx`,
`/privacy` and `/terms`) still resolve and that /privacy links to /sms-terms.

## Cutover steps, in order

Founder merges dev into main in GitHub Desktop (resolving the two conflicts
above), Vercel auto-deploys production. Then, in order:

### 1. Supabase (prod project)

Production has never had the app schema, so ALL 18 migrations in
`supabase/migrations/` must be applied to the prod project, oldest first:

```
20260710152050_initial_schema
20260710163041_auth_user_trigger
20260710194432_billing_and_company_signup
20260711190313_onboarding_v2
20260711201642_admin_capability
20260711210605_admin_actions
20260711230000_quote_uploads_storage
20260711240000_prospect_notes_and_overrides
20260712100000_company_is_internal
20260712110000_scheduled_sends
20260712120000_number_guardrails
20260712130000_flexible_timeline
20260713153000_feature_tour_column
20260713160000_relay_cell_verification
20260713170000_shared_email_intake
20260713190000_level2_agent
20260713233000_growth_basics
20260714100000_prospect_soft_delete
```

First verify the prod project's applied-migration state (it should be empty of
these). Link the CLI to prod, `supabase migration list` to confirm, then
`supabase db push`. Re-link back to dev afterward (see OPERATIONS.md "Supabase
migrations"). The initial_schema migration also creates the `quotes` Storage
bucket + RLS; confirm the bucket exists in prod after.

### 2. Vercel Production env vars

Set on the Production environment only (never let a prod key touch Preview):

- `APP_URL=https://getreknock.com` (already set as a "sensitive" var; the boot
  guard in next.config.ts hard-fails the build if it is missing or not public
  https, so a wrong value fails loudly on the first prod build).
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (the PROD Supabase project's values).
- `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (Stripe LIVE mode),
  `STRIPE_WEBHOOK_SECRET` (from the live webhook in step 5).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`
  (the PROD Twilio account/service).
- `ANTHROPIC_API_KEY`.
- `RESEND_API_KEY` (mint a PROD key named `reknock-app-prod`),
  `RESEND_WEBHOOK_SECRET` (from step 4).
- `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (prod Inngest env).
- `TWILIO_SHARED_NUMBERS` (the prod shared line).
- Leave `ALLOW_NUMBER_PURCHASE` UNSET (per-tenant number purchasing stays off
  until the 10DLC strategy is settled). `DEV_SMS_ALLOWLIST` is dev-only; do not
  set it on prod (allowlisting only applies when VERCEL_ENV !== production).

### 3. Inngest (prod)

After the first successful prod deploy, register the functions against prod:

```
curl -X PUT https://getreknock.com/api/inngest
```

Confirm 11 functions register (matches lib/inngest/functions.ts). Sync must be
run per environment; the dev sync does not carry over.

### 4. Resend (inbound email intake)

Create a SECOND webhook (event email.received) pointing at
`https://getreknock.com/api/webhooks/resend`, using the prod key. Keep the
preview webhook separate and intact. The receiving MX for getreknock.com is
domain-wide and already live, so do the receiving-enable / verification steps in
a LOW-STAKES window: enabling receiving re-pends the whole domain until MX
re-verifies, and outbound Resend from the domain is 403-blocked while pending.

### 5. Twilio (PROD account)

- Confirm the A2P 10DLC campaign on the PROD account is APPROVED. Dev campaign
  status does NOT transfer. If it is still IN_PROGRESS, carriers may reject
  sends (error 30034 unregistered / 30007 filtered) even though Twilio accepts
  them.
- Point the prod number's inbound webhook at `https://getreknock.com/api/webhooks/twilio`.
- Point the status callback at `https://getreknock.com/api/webhooks/twilio/status`.
- Verify Advanced Opt-Out is configured with the registered STOP/HELP strings
  (or Twilio's default opt-out responses are disabled), so our custom
  confirmations are not double-sent / 21610-blocked.

### 6. Stripe (LIVE mode)

- Live-mode webhook at `https://getreknock.com/api/webhooks/stripe` for
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed`.
- Confirm `STRIPE_WEBHOOK_SECRET` on Vercel Production matches the live webhook.
- Confirm the live-mode prices exist (the $1/week trial + $29 founding / $39
  standard / annual) with the same lookup_keys the app reads; test-mode prices
  do not carry to live.

### 7. Compliance sanity (the reason /sms-terms exists)

- Confirm `https://getreknock.com/sms-terms` now returns 200 (it 404s today).
- Confirm the 10DLC campaign CTA / opt-in URL registered with Twilio points at
  a URL that is now live in production.
- Confirm /privacy and /terms are the dev versions (post-conflict-resolution)
  and that /privacy links to /sms-terms.

### 8. Smoke test (real, on prod)

signup -> Stripe LIVE checkout ($1 charged today, confirm in Stripe) -> confirm
email -> onboard (6 steps, pick a number) -> add a quote with "Start now" ->
first touch schedules DAY-spaced not minutes (testMode is off on prod) -> reply
freezes + relays -> reply to the relay reaches the homeowner -> STOP works over
the air. On prod the 2h min-gap and TCPA quiet hours are ACTIVE. Note: the first
real onboarding fires drip email 1/5 about an hour in.

### 9. Watch after cutover

- `failed_jobs` table (dead-letter).
- `events` types: `delivery_filtered` (30007), `relay_delivery_failed`.
- CI on PRs to main stays green (freeze-race + loop-guard tripwires).
- Twilio delivery status callbacks landing on the messages ledger
  (send_meta.delivery_error_code).

## Rollback

Production is a single Vercel deploy. If the launch build is bad, use Vercel's
instant rollback to the previous production deployment (the marketing shell).
Note that DB migrations do not auto-roll-back; migrations here are additive
(new tables/columns), so a Vercel rollback to the marketing shell leaves the new
tables unused but harmless.

## Cross-reference

OPERATIONS.md has the older short-form cutover list and the ongoing email-intake
ops, Supabase migration commands, and phone-number / scheduled-send ops. This
document supersedes the OPERATIONS.md "Production cutover runbook" section for the
2026-07-17 state (18 migrations, 11 Inngest functions, the legal-pages conflict,
and the pending-wording blocker).
