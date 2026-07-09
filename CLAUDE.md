# CLAUDE.md — QuoteChaser (working name)

You are building a self-serve micro-SaaS: **automated quote follow-up for residential trades** (roofers, painters, fencing, decks). Contractor logs a quote; the system runs a 4-touch SMS nudge sequence in the contractor's voice; the moment the homeowner replies, the sequence freezes and the contractor is pinged by text and can answer through a relay. Solo founder, ~100-customer scale target, optimize for boring and correct over clever.

## Stack (fixed — do not substitute)
- **Next.js (App Router) on Vercel** — one deployable app. No microservices, ever.
- **Postgres** (Supabase or Neon) — schema is in `schema.sql` at repo root. Treat it as the contract; propose migrations rather than silently diverging.
- **Inngest** — all scheduling, delayed jobs, retries. No cron scripts, no setTimeout.
- **Twilio** — SMS + number provisioning + ISV 10DLC (Trust Hub) sub-brand registration per tenant.
- **Stripe Billing** — $1/week trial (card required at signup), then $39/month. Stripe is source of truth; webhook-mirror status onto `tenants`.
- **Anthropic API** — `claude-haiku-4-5-20251001` for reply classification and quote parsing; use a stronger model only for the one-time voice-profile generation at onboarding. Verify current model strings against https://docs.claude.com before hardcoding.
- **Channels**: SMS is the only outbound channel in v1. Intake is channel-agnostic by design (email forward, SMS forward, photo/screenshot of any chat including Facebook Messenger, manual entry). WhatsApp Business API is the planned second outbound channel (Pro-only or metered; per-conversation fees), with channel selected per contact - the sequence engine is channel-aware via messages.channel. Never build outbound automation for Facebook/Instagram DMs or group posting (Meta ToS; only reactive 24h-window Page replies are permitted).
- **Zapier integration** — inbound: REST endpoint to create quotes; outbound: REST hooks (subscribe/unsubscribe) firing on `quote.replied`, `quote.won`, `quote.lost`. Per-tenant API key (hash stored, key shown once).
- TypeScript everywhere. Tailwind for UI. No component library beyond shadcn/ui.

## Non-negotiable invariants (violating any of these is a bug, full stop)
1. **Tenant isolation.** Every query filters by `tenant_id`. Set `app.tenant_id` per request; RLS policies exist as backstop. Never fetch by bare primary key without tenant scope.
2. **Idempotent sends.** Every outbound message writes to the `messages` ledger with `idempotency_key = 'touch:{quote_id}:{touch_number}'` (or `'relay:{message_id}'`) BEFORE calling Twilio. Unique-constraint violation = already sent = skip silently. A retried job must never double-text a homeowner.
3. **Atomic freeze.** On inbound reply: cancel pending Inngest jobs for that (tenant, contact) AND set `quotes.frozen_at` + `status='frozen_replied'` in one transaction/flow step. The failure "homeowner replied but still got the day-10 nudge" is the product-killing bug. Write a test for exactly this race.
4. **Consent ≠ quote outcome.** STOP sets `contacts.sms_consent='revoked'` (suppresses all future sends to that contact across all quotes, forever) and freezes the quote with reason `opt_out`. It does NOT set the quote to lost — the owner closes quotes manually.
5. **Suggested replies never auto-send.** Haiku drafts; the human sends, edits, or ignores. There is no code path where model output goes to a homeowner without a human action.
6. **Quiet hours.** No automated sends 8pm–9am in the contact's local time (default to tenant tz). Relay messages from the owner are exempt — it's their lead. Reschedule, don't drop.
7. **Webhooks: persist raw payload to `webhook_events`, ack 200 fast, process async via Inngest.** Verify signatures (Twilio + Stripe). Never process inline.
8. **Messages ledger is append-only.** Status transitions only. This table is the TCPA defense file and the monthly ROI report. Log consent captures with source + timestamp.
9. **Trial cap.** Trial tenants have `trial_outbound_limit` (default 50) counting only outbound messages to prospects (sequence + relay; owner notifications don't count). On cap: freeze active sequences with reason `trial_cap`, text the owner an upgrade link, never silently drop sends.

## Reply classification (Haiku)
Classify every inbound homeowner message into: `buying_signal | question_objection | not_now | lost | opt_out | confusion | other`, with confidence 0–1. Below 0.7 confidence → treat as `other` → default behavior: freeze + ping owner. Misrouting a hot lead to `lost` is the one unforgivable classification error, so the prompt should be biased toward `buying_signal`/`question_objection` when ambiguous. Store every classification in `reply_classifications` (this becomes the eval set later). For `question_objection`, also draft a suggested reply using the tenant's `voice_profile`; keep it under 300 characters, plain, no discounts or claims about materials/pricing the quote doesn't contain.

## Relay design
Owner notifications are SMS from the tenant's dedicated Twilio number to `owner_phone`. Sending a notification opens a `relay_session` (24h expiry). Inbound SMS from `owner_phone` routes to the open session's contact. If 2+ sessions are open, the notification instructs prefixing (`1) your message`), and unprefixed replies route to the most recent session. Homeowner-facing relay messages are logged with `is_relay=true`.

## Onboarding flow (self-serve; the only manual step is founder copy-review, keep it removable)
1. Signup → Stripe Checkout ($1/week trial, card required).
2. Collect: business name, legal name, EIN, trade, owner phone/email, timezone.
3. Auto-provision: local Twilio number (match owner area code) + submit ISV sub-brand/campaign via API. Tenant sits in `provisioning='submitted'`; UI shows "your texting line is activating (typically 1–2 days)". Everything except live sends works during this window.
4. Voice interview: 4–5 chat questions ("How do you talk to customers? Formal or casual? How do you sign off?") → generate `voice_profile` + draft default sequence (4 touches: day 2 check-in, day 5 value-add, day 10 soft close, day 20 last call). Tenant edits/approves.
5. Founder review queue: new tenant's sequence copy needs `sequences_approved=true` before first live send (protects shared sender reputation). One-click approve in an internal `/admin` page.
6. Onboarding coaching moment: prompt the contractor to always ask leads "best number to text your quote to?" (converts platform-locked leads into SMS-reachable ones), and offer the option to use their ReKnock number as their outgoing quote line so the whole conversation lives in one thread (pairs with missed-call text-back later).
7. First quote: manual form (name, phone, amount, job type) OR email-forward parsing OR Zapier. Quote form includes the consent line pattern; log consent source.

## Quote intake channels
- **Manual form**: 4 fields, mobile-first, <15 seconds to complete.
- **Conversational intake (required behavior)**: forwarded texts arrive without the original sender's phone number, and chat screenshots show names but not numbers. Whenever a parse is missing a required field (phone, name, or amount), ReKnock texts the owner a single follow-up question ("Got it - what's Sarah's number?") and completes the quote from the reply. Intake never fails silently and never guesses a phone number. PDFs are supported via email intake only (unreliable over MMS).
- **Email parse**: per-tenant address `quotes-{slug}@in.yourdomain.com` (Postmark/SendGrid inbound). Haiku extracts {name, phone, amount, job_type} from forwarded quote emails/PDF text; on low confidence, create as `draft` and ping owner to confirm, never guess a phone number.
- **Zapier/API**: `POST /api/v1/quotes` with API key auth.

## Build order (each phase shippable; do not start a later phase early)
1. **Core loop, one hardcoded test tenant**: schema, quote CRUD, Inngest sequence engine, Twilio send/receive, atomic freeze, relay. Prove the loop end-to-end on your own phone.
2. **Classification + suggested replies + quiet hours + ledger/report query.**
3. **Multi-tenant self-serve**: auth (Supabase Auth: Google SSO + email/password with confirmation email before onboarding), Stripe trial/billing + cap enforcement, Twilio provisioning + 10DLC submission flow, onboarding wizard + voice interview, admin review queue.
4. **Intake expansion**: email parsing, Zapier endpoints + REST hooks.
5. **Retention report**: monthly email/SMS "X replies, $Y closed from followed-up quotes" straight from `events` + `messages` SQL.

## Explicitly do NOT build
- Microservices, message buses, Redis (Inngest covers it), analytics tools (SQL on `events` is the analytics), an owner mobile app (SMS relay + responsive web is the app), email touch channel (v1 is SMS-only), Jobber integration (v2; keep `quote_source` enum ready), team/multi-user accounts, custom sequence builder UI beyond editing the 4 default touches.

## Testing priorities (in order)
1. The freeze race: reply arrives while a touch job is mid-flight → no send.
2. Idempotency: same touch job runs twice → one message.
3. Consent suppression: revoked contact blocks sends across all quotes.
4. Quiet hours rescheduling across timezones + DST.
5. Trial cap boundary: 50th message sends, 51st freezes + notifies.
Everything else can be manual QA at this scale.
