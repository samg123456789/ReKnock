# ReKnock: Complete Product and Engineering Handoff

> Architecture update (2026-09-25): the hosted Company OS/Product Agent was
> retired. Read `docs/CODEX_OPERATING_MODEL.md` first. Company OS sections in
> this older handoff are historical and are not active deployment instructions.

**Prepared:** 2026-09-10  
**Repository:** `samg123456789/ReKnock`  
**Audited branch:** `dev`  
**Current HEAD:** `554e51f` (`Pause public signup and add waitlist flow`)  
**Production domain:** https://getreknock.com

## How to use this document

This is the context packet for handing ReKnock to another engineer or LLM. It describes the product, the current implementation, the intended strategy, the agent systems, operations, credentials, and the remaining work.

It is deliberately safe to share as a project brief. Secret values are not copied here. The local environment file contains real credentials and must never be pasted into an LLM, committed to Git, or sent in a normal chat.

## 1. What ReKnock is

ReKnock is a focused follow-up assistant for residential contractors: roofers, painters, landscapers, HVAC companies, remodelers, and similar trades.

The core problem is simple:

1. A contractor spends time creating and sending an estimate.
2. The homeowner does not immediately decide.
3. The contractor gets busy on jobsites and forgets to follow up.
4. The quote goes cold even when the homeowner was still interested.

ReKnock turns a quote into a short, polite, automated follow-up sequence. It drafts messages in the contractor's voice, sends them over SMS, and stops the automation immediately when the homeowner replies. The contractor then takes over the real conversation.

The product is intentionally not a broad CRM. It owns one valuable workflow:

> Keep open quotes alive until the homeowner responds, then hand the conversation back to the contractor.

The trust promise is the most important product rule:

> ReKnock can automate routine quote follow-up, but it must never continue automated follow-up after a real homeowner reply.

## 2. The product in one sentence

ReKnock texts a contractor's open quotes in the contractor's own voice, follows up a few times, freezes when the homeowner replies, and gives the conversation back to the contractor.

## 3. Who it is for

The first customer is a small residential contractor who:

- Sends estimates regularly.
- Has no dedicated sales or follow-up person.
- Uses a phone more than a CRM.
- Loses opportunities because follow-up is inconsistent, not because demand is absent.
- Wants something useful within minutes, without importing and maintaining a large database.

The initial wedge is especially strong for businesses with high-value estimates and a meaningful delay between estimate and decision, such as roofing, painting, HVAC, landscaping, and remodeling.

## 4. The core customer workflow

### Signup and payment

The contractor creates an account, goes through Stripe checkout, and enters the product onboarding flow. The public signup flow is currently being paused in the latest `dev` commit in favor of a waitlist flow, so deployment state must be checked before treating public acquisition as live.

### Onboarding

Onboarding is designed around getting to a real quote quickly, not configuring a CRM.

The current onboarding experience includes:

- Business and trade selection.
- Website-based business/context inference where available.
- Voice capture from real writing samples or text screenshots.
- Confirmation of extracted business information.
- Relay-cell setup and verification.
- ReKnock phone-number selection/provisioning flow.
- Sending preferences and timing.
- A post-onboarding education surface.

The product learns a voice profile so follow-up sounds like the contractor rather than generic marketing copy.

### Quote intake

A contractor can add a quote by:

- Uploading a photo.
- Uploading a PDF.
- Pasting quote text.
- Typing the quote manually.
- Importing a CSV through the separate import surface.
- Forwarding a quote email to the shared intake address, subject to sender verification and deployment configuration.

AI extracts fields such as homeowner name, phone number, email, location, job type, quote amount, and related quote details. The contractor sees a confirmation step and can correct low-confidence fields before enrollment.

### Follow-up sequence

The current product uses a short, finite sequence rather than an indefinite marketing campaign. The default sequence is four touches across several days, with configurable timing and message intent.

Every future message is stored as a durable scheduled `messages` row. The dispatcher finds due rows, and the sender re-checks status, opt-out, quiet hours, caps, pacing, and other safety rules immediately before sending.

Messages are drafted in the contractor's voice and include required identification and STOP handling according to the current messaging policy.

### Reply and takeover

When the homeowner replies:

1. The prospect is marked `replied`.
2. Pending automated messages are canceled atomically.
3. The inbound message is stored in the message ledger.
4. The reply is classified for internal routing and future evaluation.
5. The contractor receives the conversation through the relay/inbox/email path.
6. The contractor can respond manually from the ReKnock inbox or relay flow.

The freeze must win even if it races with a scheduled send. This is the highest-priority reliability invariant in the product.

### Outcomes

The contractor can mark a quote won, lost, paused, or otherwise update its status. The long-term product metric is not messages sent. It is replies, won quotes, and revenue recovered from quotes that might otherwise have gone cold.

## 5. What the MVP includes

The MVP is intended to be self-serve end to end:

1. Sign up.
2. Pay or enter the trial/founding flow.
3. Complete onboarding.
4. Establish the contractor's voice.
5. Connect a relay cell.
6. Select or provision a ReKnock number where the environment allows it.
7. Add a real quote.
8. Extract and confirm quote information.
9. Schedule the follow-up sequence.
10. Draft and send follow-up messages.
11. Freeze on homeowner reply.
12. Relay the conversation to the contractor.
13. Let the contractor reply manually.
14. Manage the quote in the dashboard and inbox.
15. Operate the account through settings and admin tooling.

The current dev preview has the broad MVP surface implemented, including signup, Stripe test checkout, onboarding, quote intake, scheduled messaging, reply freeze, relay, inbox, campaign settings, account settings, and admin operations. This statement comes from repository documentation and code review, not a fresh production acceptance run.

## 6. What is not the MVP

The following are deliberately deferred or limited:

- A broad CRM or full pipeline-management suite.
- Large-scale CSV migration as the primary onboarding path.
- Multiple campaigns at enrollment.
- Fully autonomous reactive replies to homeowners.
- Negotiation, pricing, complaints, warranty, legal, or scope-change automation.
- Jobber, Housecall Pro, QuickBooks, Facebook Lead Ads, or other speculative integrations.
- A large vector database or complex RAG system.
- An enterprise team/approval hierarchy.

## 7. Current technical architecture

### Application

- Next.js 15.
- React 19.
- TypeScript.
- App Router.
- Vercel-oriented deployment.

### Data and authentication

- Supabase Postgres.
- Supabase Auth and SSR helpers.
- Row-level security and server-side admin client operations.
- SQL migrations in `supabase/migrations/`.
- Main schema reference in `schema.sql`.

### Messaging and email

- Twilio for SMS, phone numbers, status callbacks, inbound SMS, voice hooks, and relay behavior.
- Resend for transactional email, inbound quote email, reply notifications, operational email, and Product Agent email.

### AI

- Anthropic SDK.
- Central model wrapper in `lib/ai.ts`.
- Current model constant: `claude-haiku-4-5`.
- AI is used for voice/profile work, quote extraction, website summaries, follow-up drafting, reply classification, and suggested replies.

### Background work

- Inngest for scheduled dispatch, inbound processing, retries, onboarding email, reconciliation, and Product Agent runs.
- Every send uses durable database state plus idempotent claims.

### Billing

- Stripe checkout, subscription webhooks, customer portal/cancellation path, trial/founding/standard/annual pricing configuration, and usage limits.

### Repository structure

- `app/`: pages, layouts, API routes, webhooks, and admin surfaces.
- `components/`: UI and workflow components.
- `lib/`: business logic, provider integrations, AI prompts, actions, and orchestration.
- `supabase/migrations/`: database evolution.
- `docs/`: agent strategy, Twilio onboarding, A2P resubmission, cutover, sequences, and Product Agent documentation.
- `portfolio/`: public-facing product case study, system design, and product decisions.
- `OPERATIONS.md`: operational runbook and production procedures.
- `CLAUDE.md`: detailed build history, acceptance expectations, and implementation notes.
- `.env.example`: configuration names and comments, without real values.

## 8. Reliability, compliance, and safety rules

These rules are part of the product, not optional polish:

- A homeowner reply freezes pending automated follow-up.
- STOP and HELP handling are parsed and persisted.
- Sending checks happen at send time, not only when a sequence is created.
- Scheduled sends are claim-locked and idempotent.
- Quiet hours and production pacing are enforced.
- Automated sends have a hard unanswered-contact cap.
- Delivery callbacks record delivered/failed outcomes and carrier error codes.
- Relay delivery failures retry with backoff and eventually create an operational failure record.
- No model-generated reactive reply reaches a homeowner without a contractor action.
- AI must not invent prices, discounts, financing, materials, scope, or quote facts.
- Low-confidence or ambiguous intent is biased toward human review.
- Every important action is represented in the event/message ledger.
- Real Twilio number purchases are guarded by production environment checks and explicit configuration.
- Shared-number and per-tenant-number behavior must be kept separate.

The main known scaling debt is that the early product uses a shared/sole-proprietor messaging setup. Before onboarding real customer number volume, the system needs tenant-scoped inbound routing by destination number and a scalable per-tenant 10DLC registration model.

## 9. The agents already built

There are two distinct agent systems. They should not be conflated.

### Agent A: customer-facing Level 2 Follow-up Agent

Source documentation:

- `docs/AI_AGENT_STRATEGY.md`
- `lib/prompts/reply-classifier.ts`
- `app/api/webhooks/twilio/route.ts`
- `supabase/migrations/20260713190000_level2_agent.sql`

What it does today:

1. Receives a homeowner reply.
2. Freezes the automated sequence first.
3. Classifies the reply as interested, question, reschedule, not now, lost, opt out, or other.
4. For sufficiently confident `question` or `interested` replies, drafts a response in the contractor's voice.
5. For reschedule replies, proposes a future reminder.
6. Places the proposal in the contractor relay flow.
7. If the contractor texts `1`, the stored proposal is sent through the normal safety path.
8. If the contractor writes something else, their own words are sent instead.
9. Records offered, accepted, replaced, and reminder events for measuring trust and quality.

What it does not do:

- It does not autonomously answer a homeowner after an inbound reply.
- It does not negotiate.
- It does not invent quote details.
- It does not bypass the normal send path.
- It does not override STOP, freeze, pacing, or compliance rules.

This is the correct near-term agent because it creates an employee-like experience while keeping a human approval action in the loop.

### Agent B: Company OS Product Agent v1

Source documentation/code:

- `docs/COMPANY_OS_PRODUCT_AGENT.md`
- `lib/company-os/product-agent.ts`
- `lib/company-os/product-agent-runner.ts`
- `lib/company-os/product-agent-actions.ts`
- `app/api/webhooks/github/route.ts`
- `app/admin/company-os/page.tsx`
- `supabase/migrations/20260821120000_company_os_product_agent.sql`

What it does:

1. Receives a GitHub push webhook.
2. Verifies the GitHub signature.
3. Persists the raw event in `agent_events`.
4. Enqueues a `product/github.push` Inngest event.
5. Reads the push summary and commit context.
6. Generates an internal plain-English summary, customer impact, product ideas, UX notes, growth/revenue notes, risks, and action items.
7. Stores the run in `product_agent_runs` and `product_changelog_entries`.
8. Emails the result to `PRODUCT_AGENT_EMAIL_TO`.
9. Displays runs in `/admin/company-os`.
10. Supports retrying failed runs.

Guardrails:

- Internal only.
- Does not contact customers.
- Cannot buy anything or upgrade plans.
- Does not publish externally.
- Human approval is required for pricing, positioning, public claims, payments, or risky production changes.

The code for Product Agent v1 is present. Its remaining work is environment/deployment verification: production migration, production environment variables, GitHub webhook, Inngest sync, verified Resend sender domain, and one test push.

### Agent roadmap

The intended autonomy ladder is:

- Level 0: drafted scheduled sequences. Implemented.
- Level 1: inbound reply perception/classification. Implemented.
- Level 2: suggested reply or reminder, human taps `1`. Implemented.
- Level 3: bounded autopilot for only low-risk, high-confidence intents. Not yet approved for production.
- Level 4: goal-level quote revival and sequence optimization. Later.

Level 3 must not be built casually. It requires evidence from Level 2, explicit tenant opt-in, a policy table, updated messaging registration language, an evaluation harness, confidence thresholds, hard escalation rules, a kill switch, and full transcript visibility.

## 10. Product and pricing plan

The strategic pricing ladder in `ROADMAP_V2.md` is:

- Solo: roughly $29-$39/month.
- Pro: roughly $79/month.
- Crew: roughly $149/month.
- Agent: roughly $199+/month.

The value story should remain outcome-based:

- Solo: follow up with quotes in the contractor's voice.
- Pro: capture more leads through missed-call text-back, email/review channels, and integrations.
- Crew: manage multiple estimators and see close-rate accountability.
- Agent: book appointments and revive dead opportunities with bounded automation.

The founding offer is described as $29 locked for life for the first 20 customers. Verify live pricing and availability before making this a public claim.

## 11. Recommended next steps

### Immediate verification before launch

1. Confirm whether the new waitlist flow is intentional and whether public signup should remain paused.
2. Run the complete founder acceptance flow on the current dev preview.
3. Confirm the latest migrations are applied in the target Supabase environment.
4. Confirm the production `APP_URL` is exactly `https://getreknock.com` by running a production build/deploy guard.
5. Confirm Stripe live/test webhook endpoints and secrets match the environment.
6. Confirm Twilio A2P campaign status and Advanced Opt-Out configuration.
7. Confirm Resend domain verification and inbound `quotes@getreknock.com` webhook configuration.
8. Sync Inngest against each deployment environment.
9. Register the GitHub webhook and run one Product Agent test push.
10. Verify that `ops@getreknock.com` is a verified Resend sender.

### MVP launch gate

Do not call the MVP launched until this scenario passes in the intended environment:

1. Create a fresh account.
2. Complete payment/trial.
3. Complete onboarding.
4. Add a real test quote.
5. Observe the scheduled messages.
6. Deliver one message to an allowlisted test phone.
7. Reply as the homeowner.
8. Confirm all pending messages cancel.
9. Confirm the contractor receives the reply.
10. Reply manually from the contractor side.
11. Confirm delivery status and event ledger entries.
12. Confirm STOP behavior.
13. Confirm a failed delivery is visible and retry-safe.

### First fast-follow features

Prioritize by customer value and existing infrastructure:

1. Revenue-recovered dashboard number.
2. Email as a second follow-up channel.
3. Email-first review requests after a quote is marked won.
4. Missed-call text-back and voicemail transcription.
5. Mobile share-sheet quote intake.
6. Zapier-style create-prospect endpoint and outbound hooks.
7. Level 2 acceptance-rate reporting.

### Build only after evidence

- Level 3 bounded autopilot.
- Google Calendar booking.
- Crew/multi-estimator reporting.
- Jobber/HCP/QuickBooks integrations.
- WhatsApp or Facebook lead ingestion.
- Automated weather/storm triggers.

## 12. External links and important routes

### Public product

- Main site: https://getreknock.com
- Blog: https://getreknock.com/blog
- Pricing: https://getreknock.com/pricing
- ROI calculator: https://getreknock.com/roi-calculator
- Terms: https://getreknock.com/terms
- Privacy: https://getreknock.com/privacy
- SMS terms: https://getreknock.com/sms-terms
- Dev preview referenced in repository docs: https://reknock-git-dev-re-knock.vercel.app

### Webhook routes

- GitHub: `POST /api/webhooks/github`
- Stripe: `POST /api/webhooks/stripe`
- Twilio inbound SMS: `POST /api/webhooks/twilio`
- Twilio delivery status: `POST /api/webhooks/twilio/status`
- Twilio voice: `POST /api/webhooks/twilio/voice`
- Resend inbound email: `POST /api/webhooks/resend`
- Inngest sync/endpoint: `PUT /api/inngest`
- Product Agent manual processing: `/api/company-os/product-agent/process`
- Product Agent admin UI: `/admin/company-os`

### Repository documents to read first

1. `README.md`
2. `REKNOCK_HANDOFF.md`
3. `CLAUDE.md`
4. `OPERATIONS.md`
5. `ROADMAP_V2.md`
6. `docs/AI_AGENT_STRATEGY.md`
7. `docs/COMPANY_OS_PRODUCT_AGENT.md`
8. `docs/CUTOVER_RUNBOOK.md`
9. `portfolio/README.md`
10. `portfolio/SYSTEM_DESIGN.md`
11. `portfolio/PRODUCT_DECISIONS.md`

## 13. Accounts, configuration, and credential inventory

### GitHub

- Repository: `git@github.com:samg123456789/ReKnock.git`
- Current working branch: `dev`
- Current branch has an `origin/dev` remote-tracking branch.
- GitHub contains source code, migrations, workflows, public assets, and non-secret documentation.
- GitHub does not contain `.env.local`, provider secrets, database contents, live customer data, or dashboard-side webhook configuration.

### Supabase

- Dev project name referenced in `.env.example`: `reknock-dev`.
- Dev project ref: `hgmjkugxrsxxarjdgevc`.
- Local configuration uses:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_ACCESS_TOKEN` for management/verification scripts
- Database migrations are in `supabase/migrations/`.
- Never expose the service-role key or management token to a browser or another model unless there is a secure secret-handling mechanism.

### Vercel

- The app is designed for Vercel deployment.
- Environment values are separated by Development, Preview, and Production.
- Production must use `APP_URL=https://getreknock.com`.
- `ALLOW_NUMBER_PURCHASE` must remain unset/false except when intentionally enabling a guarded production purchase flow.
- The local file may contain a Vercel OIDC token. Treat it as a secret and rotate it if it has ever been copied into chat or shared externally.

### Stripe

Configuration names:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_PRICE_TRIAL`
- `STRIPE_PRICE_FOUNDING`
- `STRIPE_PRICE_STANDARD`
- `STRIPE_PRICE_ANNUAL`

Dev uses test-mode keys. Production must use live-mode values and a production webhook endpoint. Price IDs are also resolved through lookup keys in parts of the codebase, so verify the live dashboard rather than assuming dev IDs transfer.

### Twilio

Configuration names:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_PRIMARY_CUSTOMER_PROFILE_SID`
- `TWILIO_SHARED_NUMBERS`
- `DEV_SMS_ALLOWLIST`

Important operational requirements:

- Verify the A2P/10DLC campaign is approved in the correct Twilio account.
- Verify Advanced Opt-Out behavior matches the registered STOP/HELP copy.
- Verify inbound SMS, status callback, and voice webhook URLs point to the correct environment.
- Never paste the auth token into a prompt, issue, or public document.

### Anthropic

- `ANTHROPIC_API_KEY`
- Current model constant is `claude-haiku-4-5` in `lib/ai.ts`.
- The key is used server-side only.

### Resend

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `PRODUCT_AGENT_EMAIL_TO` currently defaults to `samuelgoldberg98@gmail.com` in the code/example.
- Product Agent sender: `ops@getreknock.com`.
- Shared quote intake address: `quotes@getreknock.com`.
- Domain verification and webhook setup happen in the Resend dashboard/API, not GitHub.

### Inngest

- `INNGEST_EVENT_KEY`
- `INNGEST_SIGNING_KEY`
- The endpoint must be synced after deployment, using the environment's public URL.

### Documented test account

Repository notes document a test account:

- Login: `test@getreknock.com`
- Password: documented in `CLAUDE.md`; do not copy it into a new handoff or share it externally.
- It is described as an internal/platform-admin test account and should not be treated as a customer account.

Because this credential has existed in repository documentation, rotate it before treating the repository or handoff as broadly shareable.

### Local environment status

At audit time, `.env.local` exists and contains set values for the app URL, Supabase, Stripe, Vercel OIDC, Anthropic, Twilio, Inngest, Resend, and development SMS allowlisting. The values themselves are intentionally not included here.

## 14. What GitHub will contain after connecting it

Yes, once the local repository is connected/pushed to GitHub, the committed application code will be there. In this repository, that includes the Next.js app, components, server actions, provider integrations, prompts, SQL migrations, workflows, public assets, and documentation.

GitHub will not automatically contain:

- `.env.local` or any ignored `.env*` file.
- API keys, auth tokens, webhook secrets, or passwords.
- Supabase database rows, auth users, storage objects, or production data.
- Stripe customers, subscriptions, prices, webhook configuration, or payment history.
- Twilio phone numbers, Trust Hub/A2P registration, message history, or account settings.
- Resend domain verification, inbound receiving configuration, webhook records, or email history.
- Inngest environment configuration and event history.
- Vercel environment variables, deployment secrets, domains, or project settings.
- GitHub webhook secrets and repository settings unless separately configured.

The correct mental model is:

> GitHub stores the reproducible source and migrations. The provider dashboards and secret managers store the connected services, credentials, and live data.

To recreate the system on a new machine or with another LLM, the source repository is necessary but not sufficient. You also need a secure transfer of environment variables and access to the Supabase, Vercel, Stripe, Twilio, Resend, Anthropic, Inngest, and GitHub accounts.

## 15. Handoff instructions for another LLM

Give the next LLM:

1. This file.
2. The repository itself or a fresh GitHub checkout.
3. The non-secret environment variable names and intended environments from `.env.example`.
4. A secure secret injection mechanism, not pasted secrets.
5. The current branch and commit.
6. The acceptance test requirement: no feature is complete until it works end to end.
7. The product invariant: homeowner reply freezes automation and hands control back to the contractor.
8. The agent boundary: reactive AI suggestions require contractor action; no autonomous homeowner reply without explicit future approval and compliance work.

The next LLM should read `CLAUDE.md` and `OPERATIONS.md` after this handoff, but should treat dated notes in those files as historical evidence and verify anything that may have changed since the note was written.

## 16. Bottom line

ReKnock is a narrow, trust-first revenue recovery product. The MVP is already substantially implemented in the dev branch: quote intake, voice-matched follow-up, scheduled sending, compliance controls, reply freeze, relay/inbox takeover, billing, admin operations, and two agent surfaces.

The next challenge is not inventing more features. It is proving the full flow in the intended production environment, finishing provider configuration, resolving the shared-number/A2P scaling debt before real customer volume, and measuring whether follow-up produces replies and recovered revenue.
