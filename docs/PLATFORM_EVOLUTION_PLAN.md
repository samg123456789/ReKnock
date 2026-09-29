# Compass platform evolution plan

Updated 2026-09-29.

## Current product reality

Compass already has the core quote-follow-up loop:

- `/onboarding` is an eight-state wizard: business basics, business identity, voice answers, voice review, sending hours, owner phone verification, ReKnock number, and finish.
- Onboarding saves each major section as it is completed and derives the resume position from saved company, voice, sending-window, phone, and number records.
- `/app/quotes/new` accepts photo, PDF, pasted text, manual entry, CSV, or forwarded quote email. It extracts quote fields and lets the contractor choose a campaign and start time.
- `/campaign` supports multiple named campaigns, up to eight touches, per-touch day offset, preferred time, purpose, custom copy, preview, reordering, duplication, removal, and enable/disable.
- Active quote timelines are independent after enrollment. Editing the campaign changes new quotes, not already-scheduled quotes.
- `/inbox` is a full SMS thread with scheduled touches, edits, manual replies, reminders, status changes, and reply freeze.
- Reply notifications currently go to the account owner by email and to the in-app bell. The bell uses local storage for read state.
- Quote forwarding is already live as an intake path. Resend is used for inbound email parsing and owner notifications.
- The public pricing page now shows one Starter offer. Standard Starter is `$79/month`; founding access is `$39/month` or `$390/year` locked for life for the first 20 contractors. Growth and Crew are not part of the current product surface.
- The public `/signup` route is currently a waitlist page, not an account-creation form.

## Immediate issues

### Login versus signup

There is no source-level redirect from `signIn` to `/signup`. `signIn` redirects to `/app`, while middleware redirects a signed-in user away from both `/login` and `/signup` to `/app`. The visible paths into `/signup` are marketing CTAs and the `New here? Start for $1` link in `LoginForm`.

The reported behavior is therefore not proven by the current source. It is likely one of:

1. A user is following the `Start for $1` link and landing on the waitlist page, which now looks like signup.
2. A stale or missing Supabase session is causing the login action to return an error and the user is using the signup link.
3. An email confirmation or OAuth callback is returning to a stale funnel URL.

Definition of done: test password login, magic-link login, Google login, an unconfirmed account, a paid but incomplete account, and a paid/onboarded account in a clean browser. Each state must land on exactly one of `/login`, `/checkout`, `/onboarding`, or `/app`.

### Onboarding

The current wizard is thorough but front-loads carrier and compliance setup before the user has seen the product value. The highest-friction states are the legal/business identity form, phone verification, and number selection. Quote volume is also collected only at the end even though it is used to qualify the account.

Target flow:

1. Business snapshot: website, trade, and service area. Infer wherever possible.
2. Voice reveal: use website or one real text sample, then confirm or adjust.
3. Operating preferences: timezone and sending hours, with sensible defaults.
4. First quote: show the extracted quote and the complete planned chase before anything sends.
5. Connection setup: verify owner phone and activate the ReKnock number in the background, with a clear status card.

The legal/Twilio identity form can remain available under Settings and should only block activation where carrier requirements genuinely require it. The user should be able to see the first quote chase before waiting on number activation.

### Campaigns

Multiple campaigns are useful only when the contractor is changing the reason, timing, or audience of the follow-up. Good first-class use cases are:

- high-value or long-cycle jobs versus small jobs;
- new quotes versus stale quote reactivation;
- residential versus commercial work;
- seasonal work or storm follow-up;
- different estimator or brand voice.

Campaigns should not become a general automation builder. Add a short explanation beside the selector, a recommended campaign, and templates such as `Standard quote`, `High-value project`, and `Revive an old quote`. Keep the advanced editor for users who need it.

### Pricing and waitlist

Public pricing should show one Starter offer at `$79/month`. The first 20 customers receive Starter at `$39/month` or `$390/year`, locked for life. Growth and Crew can return as coming-soon plans only after their functionality and Stripe products exist.

The waitlist should be a private database intake, not a mailto link. Capture email, name, trade, team size, quote volume, current follow-up method, plan interest, and an optional note. Do not create an auth account until access is granted.

### Team and usage model

Do not add a second owner-style user record. Add:

- `company_members` or a role expansion with `owner`, `admin`, and `member`;
- `company_invitations` with email, role, token hash, expiry, inviter, and accepted timestamp;
- tenant-scoped policies for members;
- an audit event for invitations, acceptance, role changes, and removals.

Team members should not be billed per seat. Plans should be differentiated by usage and capability. A simple initial model is monthly active quote allowance, with message volume as the cost guardrail:

- Starter: 100 new quotes/month;
- Growth: 300 new quotes/month plus email and missed-call features;
- Crew: 1,000 new quotes/month plus team reporting;
- later overage bundles or a metered add-on once real usage data exists.

Keep the existing hard send cap and monthly quote usage primitives. Do not introduce per-seat billing before there are real teams to observe.

### Notifications

Replace owner-only notification behavior with company notification preferences:

- each member chooses reply alerts, failed delivery alerts, usage alerts, and weekly summaries;
- replies can notify all assigned members, the owner, or the prospect owner only;
- emails include a deep link into the thread and never expose another company's data;
- in-app notifications become server-backed read/unread records instead of local-storage-only state;
- weekly summaries go to opted-in members, not every account email.

The first implementation should keep SMS relay behavior unchanged and expand only email and in-app notifications.

## Build order

1. Conversion surface: pricing cards, real waitlist, auth funnel verification, onboarding copy and progress improvements.
2. Activation: first-quote preview before carrier setup, recommended campaign templates, next-best-action dashboard.
3. Team foundation: invitation and membership schema, roles, shared inbox permissions.
4. Notification center: preferences, member routing, email fan-out, server-backed read state.
5. Usage billing: plan allowances, usage dashboard, overage experiments, then Stripe products for Growth and Crew.
6. Email follow-up: only after channel rules, unsubscribe handling, bounce handling, and cross-channel reply freeze are specified.

## Success measures

- 80% of new users reach the first quote preview in one session.
- Median signup-to-first-quote time under 10 minutes.
- Fewer than 5% of login attempts land on an unexpected funnel page.
- At least one active quote or reply per activated account in the first week.
- Notification delivery failures are visible to the affected member and in the operational ledger.
- Team accounts can add and remove members without changing billing seats.
