# ReKnock MVP - Master Build Prompt

You are the founding CTO-level engineer building ReKnock (getreknock.com), an automated SMS follow-up tool for residential contractors (roofers, painters, landscapers, HVAC, and similar trades). The founder is non-technical. Your job is to ship a working, self-served MVP: a contractor can sign up, pay, onboard, get a phone number, forward a quote, and ReKnock follows up with the homeowner automatically. No feature counts as done until it works end to end.

Execute this spec phase by phase, in order. At the end of each phase, run the acceptance checks for that phase before moving on. Do not build anything in the "Not in MVP" list.

---

## Where we left off (session handoff, 2026-07-10 pm) — delete once Phase 1 acceptance passes

**Infrastructure: DONE.**
- Environments (section 1b) done: `dev` -> preview `https://reknock-git-dev-re-knock.vercel.app`, `main` -> prod (protected by discipline, ground rule 13). Amber DEV banner on non-prod. `OPERATIONS.md` has the runbook.
- Supabase dev `reknock-dev` (ref `hgmjkugxrsxxarjdgevc`, us-west-2), CLI linked. Migrations applied: `initial_schema` (12 tables + RLS + triggers + pg_trgm), `auth_user_trigger`, `billing_and_company_signup` (company auto-created at signup; `subscription_status` nullable-until-paid; `stripe_subscription_id`, `onboarded_at`).
- Resend custom SMTP is live in Supabase Auth: confirmation/reset emails send from `noreply@getreknock.com`, off the rate-limited built-in service.
- Stripe (test mode) set up: product + 5 prices created by `scripts/stripe-setup.mjs`, resolved at runtime by `lookup_key` (trial $1 one-time, founding $29/mo + $290/yr, standard $39/mo + $390/yr). Webhook endpoint registered (4 events) pointing at the preview.
- **Assistant now has its own access**: git pushes to `dev` directly (credential store at `~/.reknock-git-credentials`), and Vercel CLI installed locally (`--no-save`) with token in gitignored `.vercel-token`, project linked (scope `re-knock`, project `reknock`). So: after each change, push + watch the build + read deploy/runtime logs directly; only escalate for human/dashboard-only actions.

**Phase 1 (auth, payments, paywall): NEARLY DONE, build green, needs an end-to-end run.**
- DONE + deployed to preview (latest Ready deploy is commit on `dev`): email/password signup (email-first two-step UX, Google-first ordering), Google SSO (`/auth/callback`), password rules (8+/capital/symbol, shared validator + live strength meter), confirmation callback, paywall middleware (unpaid->/checkout, paid+unonboarded->/onboarding), Stripe checkout, webhook mirroring status onto `companies`, billing portal action, stub `/app` and `/onboarding`.
- Redirect origin now derived from request headers (email/Stripe links no longer point to localhost on the preview).
- Client env inlining fixed (browser Supabase client reads `process.env.NEXT_PUBLIC_*` as direct literals; Google SSO no longer throws "Missing env var").
- **Checkout redesign + founding automation DONE (committed, deployed, NOT yet runtime-verified):** single Solo card matching `/pricing`, Monthly/Annual toggle, `$29` struck `$39` founding treatment, "Founding rate, X of 20 spots left"; founding is auto-applied server-side while <20 taken then silently standard (user never chooses); Pro/Crew stay marketing-only; `app/checkout/error.tsx` friendly retry boundary. Old BUG 1 (Founding crash) root cause was a missing `STRIPE_PRICE_FOUNDING` env var; killed that whole failure class by resolving prices via `lookup_key`.

**BROKEN / HALF-DONE / UNVERIFIED:**
- The new checkout has NOT been exercised with a real test card on the preview. Founding auto-pick, the Monthly/Annual toggle, and the webhook flipping `subscription_status` are built but unconfirmed at runtime.
- **$1 charge timing is unverified**: checkout uses a one-time $1 line item + `trial_period_days: 7`. Must confirm in Stripe test mode that the $1 actually charges TODAY (not deferred to trial end). If deferred, change the mechanism.
- Funnel visual-consistency pass (signup/login/check-email/onboarding/app vs marketing site) was STARTED (gathered Nav/home/pricing patterns) but NOT finished; no fixes applied yet.
- Old crash digest `3987695101` runtime logs were not pulled (fix supersedes it); can confirm via `vercel logs` if desired.

**EXACT NEXT STEPS (priority order):**
1. Run the Phase 1 acceptance test on the preview with test card `4242 4242 4242 4242`: fresh signup -> confirm email (from noreply@getreknock.com) -> `/checkout` -> pay -> lands `/onboarding`; verify via Stripe (subscription `trialing`, and whether $1 charged today) and Supabase SQL (`companies.subscription_status='trialing'`, `plan`, customer/sub ids set). Unpaid cannot reach `/app`.
2. Fix the $1-timing mechanism if the acceptance test shows the dollar is deferred.
3. Finish the funnel visual-consistency pass against the marketing site; apply fixes.
4. Then Phase 1 is complete -> founder merges `dev` -> `main` (assistant never pushes main).

---

## 0. Ground rules (never violate these)

1. Existing repo: Next.js 15 App Router, deployed on Vercel via git push. Keep that loop. Never break the deploy.
2. Always run `npx next build` locally and confirm it passes before every push.
3. TypeScript everywhere. Small, frequent commits with clear messages.
4. All secrets in environment variables (`.env.local` locally, Vercel env vars in prod). Never commit a secret. Maintain `.env.example` listing every var with a comment.
5. No em-dashes anywhere: not in code comments, not in UI copy, not in SMS templates, not in AI prompt templates.
6. Every webhook endpoint must verify signatures (Stripe, Twilio, Resend, Inngest). Reject unsigned requests.
7. Multi-tenant from day one: every table has `company_id`, Supabase row-level security on every table, every query scoped to the authenticated tenant. Write RLS tests.
8. All UI copy in plain contractor English. Reading level: 8th grade. The user is a roofer on his phone, not a SaaS admin.
9. Mobile-first UI. Assume 70 percent of usage is on a phone. Existing design system: white/blue, Space Grotesk headings, Inter body.
10. Fail loud internally, fail soft externally: log every error with context, but never show a stack trace or a dead end to the user. Every error state has a human message and a next step.
11. When a third-party call can fail (Twilio, Stripe, Anthropic, OCR), wrap it with retry (3 attempts, exponential backoff) and a dead-letter log table (`failed_jobs`) reviewable later.
12. Hard-enforce the trial message cap (50 messages) at the sending layer, not just the UI.
13. **Never push to `main` directly.** GitHub branch protection cannot be enforced on this free private repo, so this is a standing discipline rule instead: all pushes go to `dev`; `main` only ever updates when the founder merges a PR himself in GitHub Desktop after a phase passes its acceptance checks. Assistant must never run `git push` (or publish) to `main`.

---

## 1. Stack and external APIs

Use exactly this stack. Do not add vendors without strong justification.

| Concern | Choice | Notes |
|---|---|---|
| App | Next.js 15 App Router on Vercel | Existing repo |
| Database, auth, storage | Supabase | Account already created and connected to the GitHub repo. Postgres + Supabase Auth (email/password + magic link) + Storage for uploaded PDFs/images. RLS on. Set up the Supabase CLI and check migrations into the repo. |
| Payments | Stripe | Checkout + Billing + Customer Portal + webhooks |
| SMS | Twilio | Messaging Service, number provisioning API, 10DLC sole-proprietor registration, inbound webhooks |
| Transactional + inbound email | Resend | Email confirmation, notifications, and Inbound (per-tenant forwarding addresses). If Resend inbound is not available on our plan, use Postmark inbound instead. Zapier email parser is the emergency fallback only. |
| AI | Anthropic API, `claude-haiku-4-5` | Reply classification, voice profile generation, document/screenshot extraction (vision), message drafting. Use a single thin `lib/ai.ts` wrapper so the model is swappable. |
| Background jobs / scheduling | Inngest | Sequence scheduling, delayed sends, retries. Vercel-native, no server to run. |
| Errors | Sentry (free tier) | Optional but cheap insurance |

That is the complete API list for MVP: **Anthropic, Twilio, Stripe, Supabase, Resend, Inngest**. Nothing else. Apollo, CRMs, calendars, WhatsApp, Zapier are all post-MVP.

Required env vars (maintain in `.env.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`, `APP_URL`.

---

## 1b. Environments (set this up before Phase 1)

Two environments, strictly separated. The founder must never be able to break production by pushing work in progress.

- **Production**: `main` branch → getreknock.com. Production Supabase project, Stripe live mode, Twilio production credentials. Only merged into from `dev` when a phase passes its acceptance checks.
- **Development**: `dev` branch → Vercel preview deployment (automatic per-push preview URL). Separate free Supabase project (`reknock-dev`) with the same migrations applied, Stripe test mode keys, Twilio test credentials (or a cheap dedicated test number). All day-to-day work happens here.

Implementation tasks:
1. Create the `dev` branch and make it the default working branch. Protect `main` (require PR merge, no direct pushes).
2. In Vercel, scope env vars by environment: production values on Production only, dev/test values on Preview and Development. Never let a live key exist on Preview.
3. Create the `reknock-dev` Supabase project; wire the Supabase CLI so `supabase db push` applies checked-in migrations to dev, and migrations reach production only via the merge to `main` (document the exact commands in OPERATIONS.md).
4. Stripe: test mode on dev with its own webhook endpoint pointing at the preview URL; live mode webhook only on production.
5. Twilio: dev sends only to a hardcoded allowlist of the founder's own numbers (env var `DEV_SMS_ALLOWLIST`); refuse to send to anything else when `VERCEL_ENV !== "production"`.
6. Add a visible amber "DEV" banner in the app UI when not on production, so it is always obvious which site you are looking at.

Workflow for the founder: work and test on the dev preview URL → when a phase passes acceptance → merge `dev` into `main` via GitHub Desktop → Vercel deploys production.

---

## 2. Data model

Create these tables in Supabase with migrations checked into the repo (`supabase/migrations`). All tables: `id uuid pk default gen_random_uuid()`, `created_at`, `updated_at`. RLS: users can only touch rows where `company_id` matches their membership.

- **companies**: name, trade (enum: roofing, painting, landscaping, hvac, plumbing, electrical, remodeling, fencing, concrete, gutters, windows_doors, other), website, description, timezone, forwarding_slug (unique, for the inbound email address), stripe_customer_id, subscription_status (trialing, active, past_due, canceled), trial_messages_used int default 0, plan (founding, standard, annual)
- **users**: supabase auth id, company_id, full_name, cell_phone (for reply relay), email_confirmed_at, role (owner)
- **voice_profiles**: company_id, questionnaire jsonb (raw answers), master_prompt text (AI-generated, user-editable), sample_messages jsonb, version int. Keep old versions (insert new row, mark latest).
- **phone_numbers**: company_id, twilio_sid, e164, status (pending_10dlc, active, failed), area_code, tendlc_status jsonb
- **sending_windows**: company_id, day_of_week (0-6), start_time, end_time, enabled bool. Seed with recommended defaults on onboarding.
- **campaigns**: company_id, name, is_default bool, steps jsonb (array of {day_offset, template, ai_personalize bool}). Seed the default 4-touch: days 2, 5, 10, 20.
- **prospects**: company_id, first_name, last_name, phone_e164, email, address, job_type, quote_amount, quote_date, status (new, sequencing, replied, won, lost, opted_out, paused), campaign_id, source (email_forward, bcc, manual, ocr_upload), notes
- **quotes**: prospect_id, company_id, raw_source (email/pdf/image), storage_path, extracted jsonb, ocr_confidence
- **messages**: company_id, prospect_id, direction (outbound, inbound), channel (sms), body, twilio_sid, status (queued, scheduled, sent, delivered, failed, received), scheduled_for, sent_at, sequence_step int null, ai_classification jsonb null
- **inbound_emails**: company_id, from_addr, to_addr, subject, raw_storage_path, parse_result jsonb, resolution (new_prospect, updated_prospect, needs_review, ignored), prospect_id null
- **events**: company_id, type, payload jsonb (audit trail: sequence_started, sequence_stopped, reply_received, opt_out, cap_reached, etc.)
- **failed_jobs**: company_id null, job_type, payload jsonb, error text, retries int

Matching key for "is this a new prospect or an existing one": normalize and compare in this order: phone (exact E.164), then email (exact, lowercased), then name + address fuzzy (trigram similarity > 0.6). If ambiguous, resolution = needs_review and surface it in the inbox as a "Needs your eyes" card.

---

## 3. Build phases

### Phase 1: Auth, payments, paywall

Goal: someone can sign up, pay, and land in onboarding. No pay, no product.

- Supabase Auth signup (email + password). On signup, send email confirmation via Resend (branded, plain, one button).
- Immediately after signup, redirect into Stripe Checkout. Pricing:
  - Entry: $1 for the first week, card required, hard cap 50 messages during trial.
  - Founding member: $29/month locked for life, only first 20 customers (track a counter; when 20 reached, show standard).
  - Standard: $39/month.
  - Annual: 2 months free (10 x monthly price).
- Stripe webhooks: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`. Keep `companies.subscription_status` in sync. Past-due: banner + pause outbound sending. Canceled: read-only access to their data.
- Billing page in settings = Stripe Customer Portal link. Do not build custom billing UI.
- Middleware: unauthenticated → marketing site; authenticated but unpaid → checkout; paid but not onboarded → onboarding; otherwise → app.

Acceptance: fresh email can sign up, pay with Stripe test card, confirm email, and land on onboarding step 1. Webhook flips subscription_status. Unpaid users cannot reach the app.

### Phase 2: Onboarding wizard and voice profile

Goal: 5 minutes from paid to fully set up. Progress bar, one question per screen, all editable later in Settings.

Step 1, company basics: company name, trade (dropdown), website (optional), short description, timezone (auto-detect, confirm).
Step 2, voice questionnaire (this is the magic, take it seriously):
  - How do you usually text customers? (short and casual / friendly and chatty / professional and brief)
  - Do you use their first name? emojis? exclamation points? (toggles)
  - How do you sign off? (free text, e.g. "- Mike, Apex Roofing")
  - Paste 2 or 3 real texts you have sent to customers (textarea, optional but encouraged)
  - Anything you would never say? (free text)
Step 3, generate the voice profile: send questionnaire + company info to Haiku with a meta-prompt that produces a **master voice prompt**: a 150 to 300 word system-prompt describing exactly how this contractor writes (tone, length, punctuation, sign-off, vocabulary, dos and don'ts). Show it to the user in plain English ("Here is how we will sound when we text your customers"), with three AI-drafted sample follow-up texts in their voice. Buttons: "Sounds like me" (save) / "Adjust" (edit answers, regenerate) / edit the profile text directly.
Step 4, sending schedule: show recommended defaults pre-checked, per weekday toggle + time range. Recommended: Mon-Fri 9:30am to 6:30pm, Sat 10:00am to 2:00pm, Sun off, all in company local time. Copy: "These are the times homeowners actually reply, based on industry data. Change anything you want."
Step 5, contractor's cell for reply relay: "When a homeowner replies, we stop the follow-ups and text you immediately. What number should we ping?" Verify with a 6-digit code sent via Twilio.
Step 6, get their ReKnock number (Phase 3 flow, embedded here).
Step 7, show their personal forwarding address (`{slug}@in.getreknock.com`) with copy-to-clipboard and a 3-line explainer: "Forward or BCC any quote email here. We will pull out the customer details and start following up. That is it."

All of it lands in Settings, fully editable, including regenerate voice profile.

Acceptance: complete onboarding as a fake roofing company; voice profile generates and saves; settings show and edit every value; sending windows seeded.

### Phase 3: Twilio number provisioning (make it stupid-easy)

- One screen: "Pick your ReKnock number." Auto-suggest numbers in their area code (from company address or browser locale), let them search another area code. One tap to claim: server buys the number via Twilio API, attaches it to our Messaging Service.
- 10DLC: register under our ISV account. Sole-proprietor registration (no EIN needed). Collect the needed fields inside onboarding with plain-English labels, submit via Twilio APIs, poll status. Show honest status states: "Setting up your number (carriers take up to a few days)" with what works meanwhile.
- Send a test text to the contractor's own cell as the final step: "This is your new ReKnock number. Save this contact."
- Inbound SMS webhook (`/api/webhooks/twilio`): validate signature, store message, route to the reply-handling flow (Phase 5).
- Handle STOP/HELP/UNSUBSCRIBE per carrier rules: mark prospect opted_out, kill their sequence, never message again.

Acceptance: claim a number in test mode, receive the test text, inbound messages appear in the database.

### Phase 4: Prospect intake (email forward/BCC, OCR, manual)

Goal: three ways in, one clean prospect record out.

**A. Email forward/BCC (the flagship):**
- Resend inbound webhook receives mail to `{slug}@in.getreknock.com`. Verify sender belongs to the tenant (from-address matches a user email or a per-company allowlist they can edit in Settings; otherwise resolution = needs_review).
- Pipeline: store raw email → extract body text → if attachments (PDF or image), run them through the extraction step → send everything to Haiku with an extraction prompt returning strict JSON: {first_name, last_name, phone, email, address, job_type, quote_amount, quote_date, confidence per field}.
- Connect the dots: run the matching logic (section 2). Outcomes:
  - New prospect + enough fields (need at least first name + phone): create prospect, auto-enroll in default campaign, event logged, contractor gets a confirmation text: "Got it. We will start following up with {name} about the {job_type} quote on {date of first touch}. Reply PAUSE {name} to hold off."
  - Existing prospect + new info (new quote, changed amount): update record, log event, decide flow: if they were in status won/lost/replied, ask the contractor via SMS whether to restart follow-ups; if sequencing, keep going with updated context.
  - Missing required fields: conversational intake via SMS to the contractor: "Got the quote for the Johnson job but no phone number for them. Text it back and we will take it from there." Parse the reply, complete the record.
- Everything lands in inbound_emails with its resolution for auditability.

**B. OCR upload (PDF or screenshot):**
- In-app "Add a quote" screen: drag/drop or phone camera upload of a PDF or screenshot. Store in Supabase Storage.
- Images: pass directly to Haiku vision. PDFs: render pages to images server-side (first 3 pages max), pass to Haiku vision. Same strict-JSON extraction prompt as email.
- Show extracted fields in an editable confirm screen ("Check this looks right"), low-confidence fields highlighted. Confirm → same create/match/enroll pipeline as email.
- The same extraction path runs automatically for email attachments in flow A.

**C. Manual add:** simple form, same fields, same pipeline. Also support CSV import (name, phone, email, address, quote amount) with a template file, capped at 200 rows.

Acceptance: forward a real quote email (with a PDF attached) to the test address → prospect appears with correct fields and sequence scheduled. Upload a screenshot of a quote → same. Manually add → same. Forward a second email about the same person → record updates, no duplicate.

### Phase 5: The sequencing engine

Goal: the actual product. Reliable, respectful, stoppable.

- On enrollment, Inngest schedules the campaign steps: default touches at days 2, 5, 10, 20 after quote_date (or enrollment date if no quote_date).
- Message generation: for each step, Haiku drafts the text using: the master voice prompt + prospect context (name, job type, quote amount, days since quote) + the step's template/intent (gentle check-in → value nudge → "still interested?" → final courteous close). Guardrails in the prompt: under 320 characters, no em-dashes, no pushy language, always sound like the contractor, include opt-out language on the first touch only ("Txt STOP to opt out").
- Per-prospect customization: on any prospect page, the contractor can preview upcoming messages, edit any drafted message, skip a step, change the schedule, or write their own. Global customization: edit the default campaign (step timing, intent, or fixed templates) in Settings, and create additional campaigns (e.g. "big jobs" vs "small jobs") selectable at enrollment.
- Sending windows: before sending, check the company's windows in their timezone. Outside a window → defer to the next open slot. Hard floor regardless of settings: never send before 8am or after 9pm prospect-local time (TCPA quiet hours), never on major US holidays (maintain a small list).
- Stop on reply: any inbound SMS from the prospect immediately cancels all pending steps (Inngest cancellation), sets status replied, and classifies the reply with Haiku: interested / not interested / question / reschedule / opt-out / other. Relay to the contractor's cell: "{Name} replied to your follow-up: '{body}'. Reply here and we will pass it on, or call them at {phone}." Contractor's SMS reply to the relay gets forwarded to the prospect from their ReKnock number (session-based relay: most recent replied prospect, with "Reply 1/2/3" disambiguation if multiple are active).
- Trial cap: increment trial_messages_used on every outbound send; at 50 during trial, pause sending and prompt upgrade. At 40, warning email + SMS.
- Idempotency everywhere: a step can never send twice (unique constraint on prospect_id + campaign step + attempt window).

Acceptance: enroll a test prospect with day offsets compressed to minutes (test mode flag), watch all 4 touches send inside windows; reply after touch 2 → touches 3 and 4 cancel, relay arrives, contractor reply reaches the prospect; STOP works.

### Phase 6: Inbox (the chat mechanism)

Goal: every conversation in one place, scrollable, obvious.

- `/inbox`: two-pane on desktop, list → thread on mobile. Left: conversations sorted by latest activity, showing prospect name, job type, snippet, time, status chip (Sequencing, Replied, Needs your eyes, Won, Lost, Opted out), unread dot. Search by name/phone. Filter chips: All, Replied, Sequencing, Needs review.
- Thread view: full SMS history rendered as chat bubbles (outbound right/blue, inbound left/grey), infinite scroll back through history, day separators, delivery status ticks, AI-drafted upcoming messages shown as greyed "Scheduled for Tue 10:15am" bubbles with edit/skip actions inline.
- Composer at the bottom: contractor can type and send a manual SMS from their ReKnock number right there. Sending manually from a thread pauses the remaining sequence for that prospect (with an undo toast).
- Prospect side-panel: quote details, source (with link to the original email/PDF), campaign, status controls (Mark won / Mark lost / Pause / Resume).
- "Needs your eyes" items (ambiguous email matches, low-confidence OCR) appear at the top of the inbox as resolvable cards.

Acceptance: all messages from Phase 4/5 tests visible and correctly threaded; manual send works; scrolling a 100+ message thread is smooth.

### Phase 7: Settings and the "coming soon" surface

- Settings sections: Company profile (all onboarding fields, editable), Voice profile (view, edit text, retake questionnaire, regenerate), Sending schedule, Campaigns (edit default, create new), Phone number (status, forwarding address, allowlist for inbound email senders), Reply relay number, Billing (Stripe portal), Team (greyed, coming soon).
- Greyed-out with "Coming soon" badges and a "Notify me" click (log clicks to events, this is our feature-demand signal): **Analytics** (dashboard mock behind a blur), **Integrations** (show logos: Zapier, QuickBooks, Jobber, Housecall Pro, Google Calendar), **WhatsApp channel**, **Email channel**, **Team seats**.
- Until Zapier integration exists, the documented manual path is: forward/BCC email intake plus CSV import. Say so plainly on the Integrations page.

### Phase 8: Hardening and launch checklist

- RLS test suite: user A can never read/write company B's rows (write actual tests hitting Supabase with two test users).
- Webhook signature tests for Stripe, Twilio, Resend.
- Rate limiting on all public API routes (upstash ratelimit or simple middleware).
- Trial cap enforcement test.
- E2E happy path (Playwright): signup → pay (test mode) → onboard → claim number → upload screenshot quote → sequence schedules → simulated reply cancels → relay fires.
- Seed script for a demo account with realistic data.
- `README.md` with local setup and `OPERATIONS.md` with: how to check failed_jobs, how to re-run a failed send, where every webhook lives, how to refund/cancel a customer.
- Sentry wired to Vercel. Uptime check on the Twilio webhook route.

---

## 4. AI prompt templates to write (store in `lib/prompts/` as versioned constants)

1. `voice_profile_builder`: questionnaire + company info → master voice prompt + 3 samples.
2. `quote_extractor`: email text and/or images → strict JSON fields with per-field confidence. Must return valid JSON only, must never invent a phone number.
3. `followup_drafter`: voice prompt + prospect context + step intent → one SMS under 320 chars.
4. `reply_classifier`: inbound SMS + thread context → {intent, suggested_contractor_action}.
5. `intake_conversationalist`: missing-field SMS exchanges with the contractor → completed JSON.

Every prompt: temperature low (0.3 or less) for extraction/classification, moderate (0.7) for drafting. Log model, prompt version, tokens per call to events for cost tracking.

---

## 5. Not in MVP (do not build, grey out where visible)

Analytics dashboard, any real integrations (Zapier, CRM, calendar), WhatsApp, email as an outbound channel, team seats/roles, A/B testing, mobile apps, Airtable anything, Apollo/enrichment, multi-number support, custom domains for forwarding addresses.

## 6. Definition of done for the whole MVP

A stranger with a credit card, a Gmail account, and a PDF quote can go from getreknock.com to their first scheduled follow-up text in under 15 minutes with zero human help from us. Run that exact scenario in Stripe/Twilio test mode as the final gate.

---

## 7. Invariants carried over (hard-won, do not soften)

These are non-negotiable rules that cut across the phases above. Where a table or column is named here, use the section 2 schema (`companies`, `company_id`, `prospects`, `messages`, `events`); ignore any older names.

1. **Idempotent sends.** Before calling Twilio, write the outbound row to the `messages` ledger with a deterministic idempotency key (`touch:{prospect_id}:{step}` for sequence sends, `relay:{inbound_message_id}` for relays). A unique-constraint violation means it already sent, so skip silently. A retried Inngest job must never double-text a homeowner.
2. **Atomic freeze on reply.** An inbound reply must, in one transaction/flow step, cancel all pending Inngest steps for that (company, prospect) AND set the prospect to `replied`. "Homeowner replied but still got the day-10 nudge" is the product-killing bug. Write a test for exactly this race (reply arrives while a touch job is mid-flight → no send).
3. **Consent is not a quote outcome.** STOP/UNSUBSCRIBE sets the prospect to `opted_out` and suppresses all future sends to that phone across every quote, forever. It does NOT mark the quote lost. The contractor closes quotes (won/lost) manually.
4. **No model output reaches a homeowner without a human action for reactive replies.** Sequence touches are AI-drafted and auto-sent by design. But a suggested reply to an inbound objection/question is only ever drafted for the contractor to send, edit, or ignore through the relay. There is no code path where a classifier-driven suggested reply auto-sends to a homeowner.
5. **Relay is exempt from quiet hours; everything else reschedules, never drops.** Automated sends outside the sending window or TCPA floor are deferred to the next open slot, never dropped. Owner-initiated relay messages send immediately regardless of hour (it is their lead).
6. **Webhooks: persist raw, ack fast, process async.** Every webhook (Stripe, Twilio, Resend, Inngest) verifies its signature, persists the raw payload (to `events` or a raw store), returns 200 immediately, and does the real work asynchronously via Inngest. Never process inline.
7. **The `messages` ledger is append-only.** Status transitions only, no destructive edits. This table is the TCPA defense file and the source for future ROI reporting. Log every consent capture (STOP/START/HELP) with source and timestamp.
8. **Classification safety bias.** The reply classifier runs with a confidence floor: below ~0.7 confidence, treat the reply as ambiguous → freeze the sequence and ping the contractor rather than guessing. Bias the prompt toward `interested`/`question` when unsure. Misrouting a hot lead to "not interested"/lost is the one unforgivable classification error.

## 8. Product details carried over

- **Onboarding coaching moment.** During onboarding (fits naturally after the forwarding-address step), coach the contractor to always ask every lead "what's the best number to text your quote to?" (this converts platform-locked leads into SMS-reachable ones), and offer the option to use their ReKnock number as the outgoing quote line so the whole conversation lives in one thread.
- **Never build outbound automation for Facebook/Instagram DMs or group posting** (Meta ToS; only reactive 24h-window Page replies are ever permitted). Intake from screenshots of those chats is fine; automated outbound to them is not. WhatsApp is the only planned second outbound channel, gated behind a per-contact channel choice; keep the `messages.channel` column channel-aware so adding it later is not a rewrite.
- **No Redis, no message buses, no `setTimeout`/cron scripts for scheduling.** Inngest covers all delayed work. SQL over `events` and `messages` is the analytics layer; do not add an analytics vendor.

## 9. Testing priorities (in this order)

1. The freeze race: reply arrives while a touch job is mid-flight → no send.
2. Idempotency: the same touch job runs twice → exactly one message.
3. Consent suppression: an `opted_out` phone blocks sends across all of that company's quotes.
4. Quiet-hours / sending-window rescheduling across timezones and DST.
5. Trial cap boundary: the 50th message sends, the 51st freezes and notifies.

Everything else can be manual QA at this scale.
