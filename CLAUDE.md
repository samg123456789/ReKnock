# ReKnock MVP - Master Build Prompt

> Architecture update (2026-09-25): the hosted Company OS/Product Agent was
> retired. Read `docs/CODEX_OPERATING_MODEL.md` first. Any Company OS sections
> below are historical notes and must not be restored without an explicit
> architecture decision.

You are the founding CTO-level engineer building ReKnock (getreknock.com), an automated SMS follow-up tool for residential contractors (roofers, painters, landscapers, HVAC, and similar trades). The founder is non-technical. Your job is to ship a working, self-served MVP: a contractor can sign up, pay, onboard, get a phone number, forward a quote, and ReKnock follows up with the homeowner automatically. No feature counts as done until it works end to end.

Execute this spec phase by phase, in order. At the end of each phase, run the acceptance checks for that phase before moving on. Do not build anything in the "Not in MVP" list.

---

## CURRENT STATE + NEXT STEPS (2026-07-12, end of session) — read this first

Everything below is on `dev` (HEAD `c9dd2dc`), build green, tree clean, Inngest synced against the preview. Nothing has shipped to `main`/production yet.

### 2026-07-14 session: mail-loop postmortem (NO new loop) + feedback batch
- **"Mail loop happened again" was a false alarm — proven with three independent sources.** The founder's overnight emails were the ORIGINAL Jul 13 burst delivered late: (1) Resend send log shows the loop ran 20:55:58-20:59:49 UTC Jul 13 (~66 forwarder sends every ~3.5s, all To: gmail + test@getreknock.com) and ZERO forwarder sends after the 21:03:05 guard-verification send (gmail-only = guard working); (2) dev DB has zero inbound_emails / forward events / failed_jobs after 21:03; (3) the founder's .eml is DKIM-signed 20:58:26 UTC (inside the burst) but Gmail only accepted it 23:53:48 UTC — Gmail tempfailed the burst, SES retried for ~3h, so old loop mail landed AFTER the fix was declared. Its To: includes test@getreknock.com, impossible post-guard (off-domain-only rule).
- **Resend inbound webhook RE-ENABLED 2026-07-14 ~9:30am ET on founder go-ahead** (id 05a8e6aa-145b-4923-87d2-07251171ff57 -> preview /api/webhooks/resend). Pre-flight verified before the flip: preview deployment READY at 4b8ac66 (includes the kill switch), RESEND_API_KEY + RESEND_WEBHOOK_SECRET present on Vercel Preview (the kill switch needs the key to pull the plug), platform-admin destinations resolve off-domain-only, and zero mail arrived at Resend during the disabled window (nothing missed; Resend does NOT replay webhook events for the downtime).
- **Fifth protection layer shipped (432063b): ingestion kill switch.** /api/webhooks/resend counts raw arrivals; >=20 in 5 min -> auto-DISABLES the Resend webhook itself via API (lib/inbound-guard.ts), failed_jobs + admin email, burst mail persisted but NOT enqueued. The forward-rate breaker (15/10min) trip now also pulls the webhook. Kills volume at the source even if every per-message filter has an edge case.
- **Feedback batch shipped (a7c54ae..6ff55b6):** education cards on a shared internal grid (equal-height pinned action slots); campaign step purpose = dropdown (5 presets + "Manual - I'll write this one", exact words required when manual, intent/template mutually exclusive on save); prospect SOFT delete (migration 20260714100000 applied + recorded; deleted_at stamp, cancels scheduled + reminders, type-1 confirm modal in inbox details; all customer queries + email-intake phone match + send-time backstop exclude deleted; admin still sees everything; NO hard-delete path exists); number pick = mandatory onboarding step 6 of 7 (finishOnboarding server-gates on a live phone row; prod without ALLOW_NUMBER_PURCHASE still simulates claims, so cutover cannot dead-end onboarding); status filters = shared dropdown (ui/StatusFilter) incl. Paused + Opted out on dashboard AND inbox; disabled Analytics "Soon" nav item; settings coming-soon grid = solid rectangle (6-col base, 3 thirds up top + 2 halves below) with aligned Notify-me buttons; Notify me records per-user interest (events type feature_interest w/ user_id + email, deduped, persists across visits).
- **Latent bug flagged, not fixed:** app/inbox/page.tsx messages query is `.order(created_at, ascending).limit(2000)` — past 2000 messages/company it keeps the OLDEST 2000 and the newest threads would render empty. Flip to descending + re-sort when touched.
- **Design batch 2026-07-14 pm (d382212..charter, founder pre-decided the calls):** (1) low-confidence flagging on ALL 8 extracted fields — email + job location now visible optional inputs on the confirm screen (were saved silently with zero review), missing-confidence values treated as low; (2) feature-tour modal DELETED (no replacement banner), first post-onboarding dashboard staggers the education cards in (rise/rise-1..3) and stamps feature_tour_done_at from EducationCards; (3) quote-volume step removed from onboarding position 2 — fields still REQUIRED but on the final screen (awaited save, failure blocks redirect), wizard 7->6 steps, resume derivation updated; (4) add-quote wait copy staged (Uploading -> Reading the quote -> Pulling out the details, hand-off timed 2.5s) + confirmation rows animate 0fr->1fr grid-rows; (5) settings cards by usage (forwarding -> relay -> hours -> line -> voice -> company -> billing -> soon); (6) BEST -> quiet "Recommended" pill; (7) pricing: Growth/Crew collapsed to one anchor line under a centered Starter card; (8) **radius & shadow charter** in globals.css — compact 0.5rem / control 0.75rem / container 1rem / pills full (.btn 0.875->0.75rem, .btn-sm + .btn-icon -> 0.5rem, inbox panelInput lg->xl) and exactly three elevation shadows (.card, .shadow-overlay, .shadow-pop) replacing eight arbitrary values (Switch thumb hairline exempt); charter = its own isolated commit for preview diffing.
- **Composer batch (6beddab, same day):** manual sends now ride the scheduled-row primitive with a **60s cancelable grace window** (kind=manual, dispatcher picks it up next tick = real dispatch 60-120s after Send; previously composer -> Twilio was 0s/instant). Pending bubbles render with a live Cancel (cancelQueuedMessage; scheduled->canceled), grace note under the composer. Engine: kind=manual is exempt from windows + min-gap (invariant 5, owner's lead), cancels on opted_out at send time, sends the contractor's words with business-name identification only on the homeowner's first-ever message; rearmSequence only re-arms kind=sequence so canceled composer messages never resurrect; dev-allowlist feedback moved to action time (immediate error, not a silent cancel a minute later). **STOP line: STANDING RULE (founder, 2026-07-14, interim-conservative pending legal review) = on EVERY homeowner-facing outbound message, no exceptions incl. manual composer + relay replies.** Applied at the SEND LAYER (appendStopLine in lib/prompts/followup-drafter, choke points in sendSms for kinds sequence/reminder/manual/relay + sendClaimedMessage for all scheduled rows) so no origin can forget; deduped (strip-then-append, exact registered casing, own blank-separated line); owner_ping/system kinds excluded (incl. the carrier-registered STOP/HELP confirmations which must stay byte-exact); ledger persists the final appended body so retries + threads show what actually sent. Identification stays first-touch-only. Pending composer bubbles preview the EXACT dispatch body (same functions, c073c6d); both isFirst checks count 'delivered' as well as 'sent' (callbacks flip statuses, would have re-triggered identification). Delivered = double tick in threads (single = sent, from status callbacks). Inbox layout self-fits below any chrome (DEV banner had pushed the composer below the fold). break-words on all bubbles. Send button tooltip when empty (that was the whole "disabled button" mystery: it only disables on empty input; number provisioning never gates the composer - no-number accounts send via the shared line). LIVE-VERIFIED on the preview: synthetic due kind=manual row -> dispatcher claimed -> dev_allowlist canceled at the send layer (no SMS; test row cleaned).

### Where the product stands
- **Full MVP surface works end to end on the dev preview**: signup -> Stripe test checkout -> onboarding (6 steps, voice from real samples, feature tour after) -> add quote (photo/PDF/paste/type/CSV, start-time choice) -> engine chases in the contractor's voice -> reply freezes + relays to the contractor's cell -> owner replies relay back to the homeowner -> inbox/campaign/settings/admin all live.
- **Engine v2 is the core**: every future send is a scheduled `messages` row, all safety checks (opt-out/status/cap/windows) evaluated at send time by a 1-min Inngest dispatcher + claim-locked sender. Freeze is DB-atomic; Resume re-arms; Reminders and per-prospect timeline edits ride the same primitive.
- **Every prospect timeline is fully editable**: touches movable to any date+time (nearest-valid-slot suggestions), deletable, addable; clicking a touch opens the message editable and the contractor's text sends verbatim; start time chosen at intake (Start now / tomorrow / in 2 days / custom). /campaign is the template new prospects inherit.
- **Money guardrails**: real Twilio purchases only on prod with `ALLOW_NUMBER_PURCHASE=true` + hard throw off-prod; one live number per company enforced in Postgres; purchase/release -> events + admin email; Stripe cancel auto-releases numbers; weekly Twilio reconciliation cron flags orphans.
- **Live-verified on the preview this session** (real Twilio sends to the allowlisted founder phone): due touch end-to-end w/ AI draft; reminder ping + relay session; freeze held past due time; custom override sent verbatim with the STOP line on its own blank-separated line ("ReKnock Test Co: Hey Bob - ... - Jim\n\nReply STOP to opt out"); DB rejects a second number per company; reconciliation clean run. Two real bugs were caught by live tests and fixed (owner_ping suppressed first-touch STOP line; Inngest plan concurrency cap).
- **Test login**: test@getreknock.com / reknock123 (platform admin, fully onboarded, active/founding, `is_internal` so it never counts, relay cell = +13478425544, Stripe test customer linked).
- **Migrations applied to dev + recorded**: ..._company_is_internal, ..._scheduled_sends (kind/send_meta/'canceled', reminders, relay_sessions, unique e164), ..._number_guardrails (one-per-company, released lifecycle), ..._flexible_timeline (step_intent/step_template/body_is_custom). `sequence_overrides` is retired (table kept, nothing reads it).
- **Env**: `ALLOW_NUMBER_PURCHASE` (unset everywhere = no purchases), `TWILIO_SHARED_NUMBERS=+15166876417` (Vercel all envs + .env.local), Supabase PAT rotated -> gitignored `.env.local` as `SUPABASE_ACCESS_TOKEN` (old token verified dead).

### Hardening pass (2026-07-12, later session) — shipped to `dev` (`70e37a5`+)
- **Delivery-status callbacks are live**: every send passes StatusCallback -> `/api/webhooks/twilio/status` (signature-verified); delivered/failed + carrier error code land on the ledger row (send_meta.delivery_error_code), 30007 also writes a `delivery_filtered` event. Health query in OPERATIONS.md. Needs `APP_URL` set to the public https URL per env — set on Preview (dev preview URL) this session; **prod cutover must set APP_URL on Production** or callbacks silently skip.
- **CRITICAL FINDING from the first live callback**: the dev Twilio account's A2P campaign is **IN_PROGRESS (campaign_id null)** and the shared line +15166876417 returned **error 30034 (unregistered number)** on a real send — carriers are currently REJECTING dev sends even though Twilio accepts them (SID + status 'sent', then undelivered). Prior "live-verified" sends may have stopped arriving. Founder: check the campaign in the Twilio console (and the PROD account's campaign status before cutover); if throughput ever feels capped post-approval, confirm secondary vetting + EIN/business-name exact match.
- **Freeze race hardened + tested**: the freeze backstop recheck now runs AFTER Haiku drafting, immediately before the Twilio call (drafting was a multi-second unguarded window on a claimed row). `scripts/freeze-race-test.mjs` races the real claim/freeze SQL concurrently against dev: 12/12 pass, no send after freeze.
- **Send pacing**: hard 2h min gap between automated sends to the same homeowner enforced at send time (prod-only, non-configurable, any timeline arrangement); 0-10 min jitter on morning slots, later touches, and window deferrals (anti-burst).
- **Relay reliability**: relay/owner-ping Twilio failures now enqueue `sms/retry.requested` -> `retry-sms-delivery` Inngest fn (3 retries w/ backoff, failed->queued claim = single-send); final failure -> failed_jobs + `relay_delivery_failed` event + admin email. Relay sessions open even while a retry is pending. Inngest re-synced against the preview (6 functions).
- **Boot guard**: production builds now HARD-FAIL in next.config.ts if `APP_URL` is missing or not public https (instead of silently skipping delivery callbacks). DONE 2026-07-13: founder set `APP_URL` on Vercel Production — but as a **"sensitive"** var, so the value is permanently unreadable via API/dashboard; nobody can confirm it says `https://getreknock.com` until the cutover build runs the guard (which fails loudly on a wrong value — verified locally both directions with tsx). No prod redeploy happened after setting it, which is fine: main has neither the guard nor the callback code, so nothing on prod reads APP_URL until cutover.
- **Freeze-race CI is LIVE and GREEN (2026-07-13)**: founder pushed `.github/workflows/freeze-race.yml` (commit `2afa7b2`; assistant's push was rejected — PAT lacks `workflow` scope) and added the `SUPABASE_ACCESS_TOKEN` Actions secret. Early runs flapped: failures died before the first DB write (no orphaned RaceTest rows) = Supabase Management API rate limit — CI runners outpace a laptop and trip the per-token limit. Fixed in `b0d1ed3`: sql() retries 429/5xx with backoff, AND the run self-reports its outcome to the dev DB (pass -> `events` type ci_freeze_race_pass, failure -> `failed_jobs` job_type ci_freeze_race with exact error; NEITHER row on a red run = the GitHub secret can't authenticate). Assistant reads CI verdicts from the DB now — no Actions API access needed (still 403; grant the PAT "Actions: Read" for direct access). CI pass verified from inside the runner: run 29261051909, source=ci, 12/12.
- **Opt-out config flag (founder console check, not code)**: our webhook custom-parses STOP/HELP with the registered exact strings, but if the Messaging Service has Twilio's default opt-out active, Twilio blacklists + auto-replies its own copy and our confirmation 21610-fails. Verify Advanced Opt-Out is configured with the registered strings (or Twilio default responses disabled). Keep webhook parsing regardless (it drives DB suppression).

### Feedback + feature batch SHIPPED to dev (2026-07-13 pm, commits 3a9e5c3..2fd7245)
- **formatMoney** (lib/format.ts) everywhere amounts render incl. drafting prompts ($10,672.20; cents only when present). **followup_drafter@2**: founder tone directive (conversational, references the prior conversation, one question, never leads with/reopens the price; reference shape in prompt). **STOP-line fix was UI-only**: ledger body was always correct, thread bubbles lacked whitespace-pre-line.
- **Feature tour**: durable companies.feature_tour_done_at (migration 20260713153000, backfilled) replaces the events lookup; X + Escape close; write verified w/ one retry. **Settings deep-link**: /settings#relay-cell scrolls+focuses the field.
- **Add-quote**: drag-and-drop + explicit type/size caption; duplicate-phone check in createQuote (allow_duplicate escape hatch, warn banner w/ open-existing/start-anyway; CSV import had this, single path did not — two adds = two parallel sequences); cancelable extraction (generation counter, Esc/button).
- **Relay-cell OTP** (migration 20260713160000): 6-digit code via sendSms kind=system before cell_phone goes live; pending_cell_* columns on users; existing numbers grandfathered verified; two-step settings UI. setRelayCell kept for admin tooling only.
- **Shared quotes@ email intake** (migration 20260713170000): quotes@getreknock.com matched by VERIFIED sender (company_sender_emails, login emails seeded verified, extra senders via emailed confirm link -> /api/verify-sender); webhook /api/webhooks/resend (svix HMAC verified manually, persists raw to inbound_emails.raw, acks, Inngest email/inbound.received); processInboundEmail fn: match -> Haiku extract -> needs_review (no trusted phone, never guess) / updated_prospect (existing phone, never double-sequence) / new_prospect + enroll + owner SMS each way; unmatched mail -> resolution 'unmatched' + event, never dropped. inbound_emails.company_id now nullable. **FOUNDER OPS NEEDED**: Resend console — inbound domain (MX for getreknock.com), route quotes@ -> POST https://reknock-git-dev-re-knock.vercel.app/api/webhooks/resend (prod URL at cutover), set RESEND_WEBHOOK_SECRET on Vercel (Preview + Production). Inngest must be re-synced per env (PUT /api/inngest) — 7 functions now.
- **Design pass foundation** (gated): shared .btn/.btn-primary/.btn-ghost/.btn-sm/.btn-lg system + shimmer .skeleton in globals.css; applied to dashboard/inbox/add-quote/settings/tour. FOUNDER GATE: compare preview before (39d8222) vs after (2fd7245) then approve app-wide sweep (marketing pages, onboarding, admin, campaign untouched).
- Preview APP_URL restored (founder's 9:59am edit had retargeted the only record to Production; delivery callbacks were silently off on preview).

### Email intake wiring (2026-07-13 pm, autonomous session while founder away)
- **Address = quotes@getreknock.com (ROOT).** Option B (subdomain) died on Resend free plan's 1-domain limit; founder picked "flip root to Resend ($0)" in a choice prompt. Root MX at Namecheap now `10 inbound-smtp.us-east-1.amazonaws.com` (ImprovMX rows deleted by founder ~12:15). DNS verified correct on every resolver incl. authoritative.
- **All Resend-side config done VIA API** (new key `reknock-app-dev`, in .env.local + Vercel Preview/Development): receiving enabled on getreknock.com, webhook 05a8e6aa-145b-4923-87d2-07251171ff57 -> preview /api/webhooks/resend (email.received), RESEND_WEBHOOK_SECRET set (Vercel Preview/Dev + .env.local). Old .env.local key was dead AND no key existed on Vercel = admin emails were silently skipped on deployed envs all along.
- **Catch-all forwarding shipped** (0271388): mail to any non-quotes@ address at the domain re-sends to platform-admin email w/ reply-to preserved (replaces ImprovMX aliases without needing the alias list; forward failures throw -> Inngest retries). Resend has NO forwards API (probed, 405s).
- **BLOCKED: Resend domain verification stuck 'pending' since ~11:57** (all 4 records incl. previously-verified DKIM/SPF; DNS objectively correct; no Resend incident). CONSEQUENCE: outbound Resend email from getreknock.com is 403-DOWN (signup confirmations, admin emails, sender-verify emails) until it flips. Tried: repeated POST /verify, 20-min untouched cycle, receiving off->verify->on (no effect). NEXT: founder opens resend.com/domains -> getreknock.com -> click Verify (dashboard may run a synchronous check the API doesn't), else Resend support. Live tests queued for the moment it verifies: (1) test@getreknock.com -> quotes@ = Bob Emailtest enrollment, (2) forward@getreknock.com -> quotes@ = unmatched, (3) test@ -> hello@ = forwarded event + Gmail arrival.
- **Design pass swept app-wide** (32b98be, founder gate waived by "do everything without asking"): onboarding, auth, checkout, admin, campaign editor, CSV import, number picker onto the shared .btn system; before/after = any pre-3a9e5c3 preview vs current.

### Level 2 AI agent SHIPPED + LIVE-VERIFIED (2026-07-13 pm, e267917..fe1bfcb)
- Relay ping is now a decision surface (docs/AI_AGENT_STRATEGY.md level 2): question/interested replies (conf >= 0.5) get a drafted answer in the contractor's voice appended to the ping ("Suggested reply: ... Text 1 to send it, or reply with your own words"); reschedule replies get a pre-filled circle-back proposal ("Text 1 and we will circle back Mar 1"). Proposal state lives on relay_sessions (suggested_kind/body/meta, migration 20260713190000 applied to dev). Owner texting bare "1" sends the stored draft verbatim through the relay path / creates an auto_send reminder + scheduled row + ack ping. Telemetry events: agent.suggestion_offered / suggestion_sent / suggestion_replaced / reminder_accepted (the accept-rate flywheel that gates level 3).
- **LIVE-VERIFIED on the preview via signed synthetic Twilio webhooks** (scratchpad technique: HMAC-signed POSTs with the real auth token; no SMS delivery needed): question reply -> voice-matched draft on session + correct ping; "1" -> draft forwarded byte-for-byte + suggestion_sent; reschedule "hold off until March" -> Mar 1 2027 proposal; "1" -> auto_send reminder + scheduled row + "Done. We will circle back with Sara..." ack. Test caught the model asserting "backsplash is included" (it cannot know) -> prompt now hard-forbids inclusion claims (suggested_reply@1 tightened). Test data cleaned.
- **40-message trial warning shipped** (1c6377e): once, SMS + email, at >= 40 of 50 (event trial_warning_sent = idempotency).
- Freeze-race CI: second root cause found + fixed with founder-granted Actions read: transient network exception ("fetch failed", run 29271018666, died at 12/12) escaped the retry (only caught HTTP 429/5xx); now retried too (0266191, validated green run 29273683068). CI verdicts also self-report to dev DB (events ci_freeze_race_pass / failed_jobs ci_freeze_race).

### Email intake LIVE-VERIFIED end to end (2026-07-13 evening)
- Resend verification finally flipped (~8h pending; nothing was wrong with DNS). ALL FOUR intake paths verified with real emails: new sender+phone -> prospect Hank Henderson + 4 scheduled touches + inbound_email_enrolled; known phone -> updated_prospect, NO second sequence, owner SMS; unregistered sender -> 'unmatched' stored; hello@ -> catch-all forward to founder gmail.
- Two live bugs found + fixed during verification: (1) received-email content endpoint is /emails/receiving/{id} (274afc1; webhook payload is metadata-only; the graceful-degradation path worked: subject-only extraction -> needs_review + owner SMS, never guessed a phone); (2) **MAIL LOOP**: catch-all forwarded to platform-admin emails incl. test@getreknock.com = an address on our own receiving domain -> re-entered the webhook forever. 60 iterations in ~4 min to the founder's gmail before kill (webhook disable via API). Guards shipped e7d237e (never re-forward forward@'s own mail; only forward to destinations OFF our receiving domain) + verified: single forward, dest gmail-only, chain stops. Junk rows + test prospects cleaned.
- NOTE: sending during Resend 'pending' is 403-blocked domain-wide (learned live): enabling receiving re-pends the whole domain until MX verifies. At PROD cutover, do the receiving flip in a low-stakes window.

### Loop incident closed (2026-07-13 late) - STANDING RULE: no real sends for testing
- Founder confirmed quota damage: Resend daily 196/100 (resets midnight UTC; outbound email dead until then), monthly fine (197/3000). RULE: all pipeline verification uses synthetic signed webhook payloads (Twilio HMAC sim + Resend svix sim), NEVER real sends. No automated email-forwarding tests without explicit founder go-ahead.
- Four-layer forwarding loop protection shipped 817c4a7 (forwarder-identity guard, X-ReKnock-Forwarded ingest marker, 15-per-10min circuit breaker + admin alert, off-domain-only destinations). Webhook re-enabled on that deploy after a zero-queued-sends sweep (0 scheduled/queued messages, 0 pending reminders in all of dev; test-prospect deletions took their queued work with them).

### GTM batch shipped (2026-07-13 late, 831807f..642a2e8) - additive only, send pipeline untouched
- SEO/AEO: llms.txt live (FAQPage/Article/Product schema ALREADY existed - earlier audit undercounted, regex read only first JSON-LD block per page). Guides in marketing nav; blog linked from drip emails 2/4 + first-quote empty state.
- /roi-calculator: free lead-magnet (avg quote x per month x honest recoverable-% slider), WebApplication schema, sitemap + footer.
- Testimonial ask: first Won per company -> prospect/won event -> testimonial-ask Inngest fn (2h delay, from Sam, reply routes to founder gmail via catch-all, once ever, skips internal).
- ~~Referral~~ PULLED same day (founder will use a third-party tool if ever): Settings card removed, ?ref= capture removed. UTM/first-touch attribution KEPT (companies.signup_source via AttributionCapture cookie + captureAttribution at onboarding). Schema left in place unused (referral_code w/ default, referred_by_code) - dropping columns is destructive for zero gain; migration 20260713233000 stays recorded so dev/prod schemas match at cutover.
- Inngest synced: 9 functions. Onboarding drip + testimonial emails NOT test-sent (no-real-sends rule); first live exercise = next real signup/win after quota reset.

### Next steps, in order
1. **Founder acceptance run** (gates dev->main): the full-surface manual pass incl. the new intake (forward a REAL quote email from his registered gmail), Level 2 relay proposals, OTP relay-cell change, design pass verdict.
2. **Hardening-pass manual test plan IN PROGRESS (2026-07-13)**: Step 0 (freeze-race CI green) done. Remaining on the preview, no delivery needed (dev A2P still pending, outbound may 30034): delivery-callback -> ledger, quiet-hours deferral at send time, manual reply-freeze race, relay ping (graded if filtered), STOP DB-side + Twilio console Advanced Opt-Out check (then text START to unblacklist). Post-A2P-approval/post-cutover: sends arrive on time, 2h min gap (prod-only code), relay-retry via magic number +15005550009 as relay cell (21211 -> 3 retries -> failed_jobs + admin email), STOP/HELP over the air, ledger health query.
3. **Founder acceptance run** (gates the first dev->main merge): fresh signup -> pay (4242 card) -> onboard -> pick number (dev = fake +1555, no charge) -> add quote with "Start now" -> touch arrives -> reply from the phone -> freeze + relay -> reply to the relay -> forwarded to homeowner -> Resume/won/lost. Verify in Stripe: $1 charged today + trial_period_days behavior (still unverified).
4. **Production cutover** (founder merges dev->main in GitHub Desktop after #2): apply the 4 new migrations to the prod Supabase, sync Inngest against prod (`PUT /api/inngest`), set prod env (`TWILIO_SHARED_NUMBERS`; leave `ALLOW_NUMBER_PURCHASE` unset until 10DLC strategy for per-tenant numbers is settled), point the prod Twilio webhook + Stripe webhook at prod URLs.
5. **Level 2 AI agent** per docs/AI_AGENT_STRATEGY.md: suggested reply inside the relay ping + "text 1 to send it", reschedule-intent -> pre-filled reminder. Highest-leverage next feature; fully inside registered behavior.
6. **Per-tenant 10DLC**: TrustHub sole-prop submission via API, status polling, auto flip pending_10dlc -> active (today the flip is a manual SQL, see OPERATIONS.md). Plus relay-cell 6-digit verification at onboarding step 5.
7. **Smaller open items**: 40-message trial warning (email + SMS) before the 50 cap; "finish setting up" reminder email (TODO in finishOnboarding); Phase 8 hardening (RLS test suite, webhook signature tests, Playwright happy path, Sentry); monthly ROI report (Phase 5 of original spec); one pre-existing dev prospect sits 'sequencing' with no scheduled rows (orphaned old-engine run), Resume it from the inbox if it matters.

### Standing rules picked up this session
- Commit + push to `dev` after every completed sub-task; keep this handoff current as you go (founder may hit session limits mid-queue).
- Never push `main`. Real number purchases never happen off production. Dev SMS only to `DEV_SMS_ALLOWLIST`.

---

## Session handoff (2026-07-12 pm) — Engine v2 + Phase 3 + full punch-list shipped to `dev` (detail)

All committed + pushed to `dev` (build green each push), Inngest re-synced on the preview.

**Shipped:**
- **Engine v2 (the big rewrite, founder-approved "no tech debt" directive).** Every future send is a `messages` row (status='scheduled', `scheduled_for`, kind sequence|reminder). Inngest `scheduled-send-dispatcher` (1-min cron) fans out; `send-scheduled-message` re-checks status/opt-out/cap/window/overrides AT SEND TIME, claims the row (scheduled->queued = idempotency lock), drafts, sends. Freeze is DB-atomic (webhook/actions flip rows to 'canceled'); **Resume now actually re-arms** (canceled rows -> scheduled, re-timed from now, cadence preserved). `lib/enrollment.ts` is the shared primitive (createQuote, CSV import, resume). Old `prospect-sequence` sleepUntil loop deleted; `lib/schedule.ts` deleted (dashboard/inbox read real scheduled rows).
- **Reminders (registered 10DLC behavior).** `reminders` table + "Circle back later" in the thread: remind_me (owner ping at remind_at + opens a relay session) or auto_send (drafted in their voice referencing the quote + note, windows/opt-out checked at send). Pending ones render as amber dashed bubbles with cancel.
- **Webhook scoped by To-number + owner relay-back.** Inbound resolves tenant via `phone_numbers.e164` (unique index), falls back to From-matching on the shared line. `relay_sessions` (24h): owner replies to a relay/reminder ping forward to that homeowner ("1)" prefix picks between open chats). STOP now also cancels scheduled rows + pending reminders.
- **Phase 3 provisioning.** Dashboard "Pick your ReKnock number" card: area-code search (verified live against Twilio), one-tap claim. Real purchase ONLY on prod with `ALLOW_NUMBER_PURCHASE=true`; simulated elsewhere. Numbers sit pending_10dlc; sends pin From= once flipped 'active' (manual flip, see OPERATIONS.md). TrustHub API submission NOT automated yet.
- **CSV import** at /app/quotes/import (200 cap, template, dedupe by phone, consent checkbox, enrolls via enrollment lib).
- **Onboarding polish** (6 steps: required quote-volume step 2, heard-about moved to final screen, focused chrome without app nav, phone-frame voice reveal w/ animation, per-day "Copy to..." hours control, resume-at-step derived server-side).
- **Punch-list:** password show/hide (shared PasswordInput), pricing 3-across w/ live founding counter, Solo->Starter / Pro->Growth renames w/ founder-supplied Starter bullets, designed check-email pages (+ email in query param), `companies.is_internal` excluded from founding counter (founder's test cos marked internal).
- **Test account:** test@getreknock.com / reknock123 (platform admin, fully onboarded, active/founding, is_internal, relay cell = allowlisted founder phone, Stripe test customer linked).
- **docs/AI_AGENT_STRATEGY.md**: autonomy ladder for AI agents messaging on behalf of customers (level 2 "agent proposes, human taps" is the next build; level 3 autopilot gated on re-registration + opt-in).
- **Number-purchase guardrails (founder directive, all four).** (1) Purchase gate confirmed AND-only (prod + ALLOW_NUMBER_PURCHASE, typo-safe). (2) One live number per company enforced in Postgres (`phone_numbers_company_uq`, verified 23505 on double insert) + claiming requires trialing/active non-suspended subscription. (3) Every real purchase/release: `events` row + admin email via Resend (`lib/notify-admin.ts`). (4) `customer.subscription.deleted` enqueues `company/numbers.release` (Inngest releases in Twilio, rows -> 'released'); weekly `number-reconciliation` cron (Mon 13:00 UTC, also on `admin/reconcile.requested`) diffs Twilio vs live companies, flags orphans/unreleased/dangling, `TWILIO_SHARED_NUMBERS` exempt (set on Vercel all envs + .env.local). Reconciliation live-verified on the preview: 1 Twilio number, 1 tracked, zero flags. Migration `20260712120000_number_guardrails` applied + recorded.
- **Live-verified on the preview:** dispatcher sent a due touch end-to-end (Haiku draft -> Twilio SID), reminder fired owner ping + opened relay session. Caught + fixed a real compliance bug (owner_ping suppressed the first-touch STOP line). Freeze test CONFIRMED: replied prospect's remaining touch stayed 'canceled' past its due time while the dispatcher was demonstrably live (it sent another prospect's touch in the same window); no send. Second live send verified the compliance fix (business name + exact "Reply STOP to opt out." on the true first touch).

- **Campaign control batch (founder directive, all items).** (1) Full per-prospect timeline flexibility: scheduled rows snapshot intent/template at enrollment and ARE the timeline; every touch is movable to any date+time (out-of-window picks get the nearest valid slot offered back), deletable, and extra touches addable ("+ Add a follow-up"); bubbles show date AND time. (2) MESSAGE OVERRIDE: clicking any scheduled touch opens the message editable; the contractor's text sends verbatim (only compliance additions). `sequence_overrides` retired; `messages.body + body_is_custom` is the override. (3) Start-time choice at intake: Start now / Tomorrow morning / In 2 days (recommended, default+dominant) / exact date-time; confirmation screen shows the REAL scheduled rows. (4) STOP line now on its own blank-separated line. (5) Education cards never dismissible (compact to a slim done-row when the feature is set up) + one-time 3-step feature tour (forward email / reply relay / local number), tracked server-side via a feature_tour_done event. (6) Non-prod can NEVER reach Twilio purchase: hard throw inside the buy branch + dev claims store an obviously fake +1555 number (never the searched real one); dev sends flow through the shared founder line as before. LIVE-VERIFIED on the preview: a custom-override touch due now sent within one dispatcher tick, body exactly "ReKnock Test Co: Hey Bob - ...(verbatim)- Jim\n\nReply STOP to opt out".

**Migrations applied to dev + recorded:** `20260712100000_company_is_internal`, `20260712110000_scheduled_sends` (messages.kind/send_meta/'canceled' status, reminders, relay_sessions, unique e164), `20260712120000_number_guardrails`, `20260712130000_flexible_timeline` (messages.step_intent/step_template/body_is_custom).

**Still OPEN:**
- TrustHub/10DLC API submission per tenant + relay-cell 6-digit verification at onboarding.
- Level 2 AI agent (suggested replies in relay ping, "text 1 to send") per docs/AI_AGENT_STRATEGY.md.
- Full human acceptance run (signup->pay->onboard->quote->reply->relay on a real phone) before founder merges dev->main; $1-charge timing on the Stripe trial still unverified.
- **SECURITY: RESOLVED.** The exposed sbp_ PAT was scrubbed from `.claude/settings.local.json` and the founder rotated it (old token verified dead, HTTP 401). The new PAT lives in gitignored `.env.local` as `SUPABASE_ACCESS_TOKEN`; assistant DB access = Management API SQL using that var (verified working).
- One pre-existing dev prospect was left status='sequencing' with no scheduled rows (its old-engine Inngest run is orphaned); Resume it from the inbox if it should keep chasing.

---

## Session handoff (2026-07-12) — Phases 1-4 of the feedback batch shipped to `dev`

All work below is committed + pushed to `dev` (build green, `tsc` clean each time). Latest commit `58807a4`.

**Shipped tonight:**
- **P0 BUG FIXED — quote intake.** Photos/PDFs were base64'd through the Server Action body (1MB Next / 4.5MB Vercel cap) so real files threw "Could not read that file" before Haiku ran. Now files upload to a private `quotes` Storage bucket via a server-minted signed upload URL; the extract action downloads server-side. Size guards (5MB img / 32MB PDF), in-browser downscale for big photos, paste/type fallback. Verified end-to-end with a real 687KB PDF and 1.4MB PNG (mint -> upload -> download -> Haiku). New migration `20260711230000_quote_uploads_storage.sql` (bucket + RLS) applied to dev.
- **Add-quote:** consent question removed (defaulted per source, still editable), close (X) + Escape to exit.
- **Performance pass:** route `loading.tsx` skeletons for all authed routes (there were none), `getActingCompany` wrapped in React `cache()` (was 2 auth+users queries per page), `Promise.all` on settings/dashboard/onboarding/inbox, optimistic inbox status buttons + `finishOnboarding` pending state, parallel `createQuote` tail.
- **Dashboard = working surface:** prospects table (search/filter/sort, next-touch, last activity), "Get more from ReKnock" education cards (forward/BCC email w/ copy icon, relay, ReKnock line; dismissible), notifications bell + unread dot (from `events`). Shared `lib/schedule.ts` for touch math.
- **Prospect depth:** editable detail panel + Notes (Notes fed into the AI drafting context). Scheduled follow-up pills are clickable -> show the live-drafted message with Edit / Skip, honored at send time via new `sequence_overrides` table (migration `20260711240000`). Freeze/idempotency untouched.
- **Campaign editor** at `/campaign` (header link): edit day offsets, intent, exact copy (`{first_name}` etc.), per-step live preview, toggle steps on/off. Engine honors templates + enabled flag. Shared `lib/campaign.ts`.
- **Verified (T17):** reply -> `prospect/replied` -> `cancelOn` cancels the job = permanent freeze; `prospect/enrolled` (the only re-arm) is emitted ONLY by `createQuote`, so NO auto-resume exists.

**Still OPEN (next session):**
- **Onboarding polish (not started):** quote-size + quotes/month as a REQUIRED step 2 (remove the collapsible optional block; move/cut "how did you hear"); hide app nav during onboarding; modernize the "Here's how we'll sound" screen (flagged 2x); per-day copy control for sending hours (replace the pill buttons); resume-at-step persistence + optional "finish setting up" email.
- **CSV bulk upload** (200-row cap) + **password show/hide eye** on signup/login.
- **Punch-list:** pricing page horizontal (3 tiers visible); rename Solo->"Starter", Pro->"Growth" (+ Starter bullet copy the founder supplied); email-confirm page design; founding-counter `is_internal` flag to exclude founder/test accounts.
- **Reschedule scheduled sends + registered Reminders feature:** needs the sequence engine moved off the single Inngest `sleepUntil` loop to per-step scheduled `messages` rows (status=scheduled, scheduled_for) + a cron that checks window/opt-out/cap at send time. This ALSO fixes the "Resume doesn't actually re-arm sends" gap (Resume currently only relabels status). Do NOT do silently; discuss with founder.
- **SECURITY (do at session start):** the Supabase Personal Access Token `sbp_292e72...` (account-level) is stored in plaintext in `.claude/settings.local.json` (3 allow-list entries) alongside a Stripe test key (line 21). File is gitignored + never committed, so exposure is local-disk only. Founder believed this token was deleted but it is LIVE. Recommend: rotate it in Supabase (Account -> Access Tokens) and scrub both secrets from the allow-list. Founder's `+acct1` test signup never paid (plan null), so no founding spot was consumed.
- **Acceptance run** from the prior handoff (below) still not completed end-to-end.

---

## Where we left off (session handoff, 2026-07-11 pm) — the full MVP surface is BUILT + deployed on `dev`; remaining work is verification

**Infrastructure: DONE.** `dev` -> preview `https://reknock-git-dev-re-knock.vercel.app`, `main` -> prod (discipline-protected, ground rule 13). Supabase `reknock-dev` (ref `hgmjkugxrsxxarjdgevc`); migrations applied through `admin_actions`. Resend SMTP live. Stripe test mode (5 prices via `lookup_key`, webhook on preview). Inngest app synced (prod env, `/api/inngest`). Assistant has its own git-push + Vercel CLI access (`~/.reknock-git-credentials`, gitignored `.vercel-token`). Env set on Preview+Dev: Supabase, Stripe (+webhook secret), Anthropic, Twilio (SID/token/`MG` service `MGb3ea8cb172bbebb57358731b77f14777`), Inngest event+signing keys, `DEV_SMS_ALLOWLIST=+13478425544`. Founder ReKnock number `+15166876417`. Admin seeded for `samuelgoldberg98@gmail.com`.

**BUILT + deployed (all on `dev`, build green):**
- **Phase 1** auth/checkout/paywall (email-first signup, Google SSO, founding auto-applied, single Solo card + Pro/Crew coming-soon).
- **Phase 2** onboarding: website-scrape inference, multi-trade + GC picker, voice from typed samples + screenshot OCR, casing, background voice gen + regen history, market/timezone + apply-to-all hours. App shell (header + avatar), dashboard with "Add your first quote".
- **Phase 4** intake: upload photo/PDF/paste/type -> Haiku extract -> confirm (low-confidence highlighted) -> create prospect + 10DLC consent path.
- **Phase 5** sequencing: Inngest `prospect-sequence` (test-mode = minutes off-prod), atomic freeze via `cancelOn`, at-send status/cap/window checks, idempotent `sendSms` gated to allowlist; inbound `/api/webhooks/twilio` (signature-verified, STOP/HELP exact replies, reply -> freeze + classify + relay).
- **Phase 6** inbox: conversation list + thread (bubbles, day separators, ticks, greyed scheduled bubbles), composer (manual send pauses sequence), won/lost/pause/resume.
- **Phase 7** settings: company/hours/voice/relay-cell/ReKnock-line/billing + coming-soon Notify-me.
- **Admin**: `/admin` (404-gated), customers table + detail, view-as support mode (audited), suspend/delete (Stripe cancel + Twilio release), `admin_audit`.

**REMAINING = VERIFICATION (MVP-first; nothing from ROADMAP_V2 until this passes):**
1. **DONE — Twilio inbound webhook configured** (primary handler, HTTP POST, no backup) at `.../api/webhooks/twilio`.
2. **Full acceptance run IN PROGRESS** on the preview (test card `4242...`): signup -> confirm email -> pay -> onboard -> add quote -> sequence fires to `+13478425544` (test mode) -> reply freezes it -> relay + inbox. Verify Stripe (`trialing`, **$1 charged today?** one-time line + `trial_period_days:7` still unverified) and Supabase. Backend verification tools: Stripe secret key (in `.env.local`); Supabase Management API SQL — `POST https://api.supabase.com/v1/projects/hgmjkugxrsxxarjdgevc/database/query` with `Authorization: Bearer <sbp access token>` and `{"query":"..."}` (runs as postgres, bypasses RLS). Use a fresh non-admin email (e.g. a gmail +alias) so it tests as a normal customer.
3. Fix $1-timing mechanism if deferred.
4. Then founder merges `dev` -> `main` (assistant never pushes main).

**>>> NEXT SESSION FIRST TASK (founder will restart fresh after acceptance passes):** repay the V1 tech debt before real multi-tenant (ROADMAP_V2 Part 4): (a) **scope the inbound webhook by the To-number -> company** (currently matches by From phone only across all tenants); (b) per-tenant number provisioning (Phase 3 real "pick your ReKnock number" flow + TrustHub); (c) sole-prop -> standard 10DLC migration. Also still open: Reminders/scheduled-messages feature (recorded in "Reminders / scheduled messages"), and onboarding step 5 relay-cell SMS verification (currently stored without a 6-digit verify).

---

## CTO review (2026-07-11) — first-principles pass, keep until Phase 6 ships

The test for every screen: **does it help a contractor get value in the first 10 minutes and win a deal in the first week?** Value = seeing ReKnock chase a *real* quote in their voice. Everything else is overhead to minimize.

**(a) Already built that must change**
1. **Onboarding dead-ends at a stub `/app`.** This is the churn moment and it currently delivers nothing. Fundamental fix: onboarding must land in the real app with exactly one next action — **Add your first quote** — because the first chased quote is the entire value proposition. (Blocker.)
2. **The app wears the marketing header.** No portal feel, no way to sign out/manage billing. Logged-in routes need an app shell (logo, avatar menu). Convention, but here it's load-bearing for trust.
3. **Onboarding asks what it could infer.** A voice *questionnaire* asks the contractor to self-describe a thing the AI can extract from two real texts or their website. Trade + description are inferable from their website. First principle: never ask for what we can infer and let them confirm. Website becomes the unlock (scrape -> AI drafts trade/description/voice); the questionnaire becomes the fallback when there are no samples.
4. **Voice generation blocks on a white screen.** It should pre-generate in the background the moment we have signal (samples/website) so the reveal feels instant. AI work happens off the critical path.
5. **Timezone asked in step 1** with no immediate payoff. Move it to the sending-hours step as a US-market dropdown; infer + confirm.

**(b) What changes in Phases 2-6**
- **Phase 2:** infer-first onboarding (website -> AI prefill), pre-generated voice, land in app with the first-quote CTA, app shell. Voice captured from real samples (typed or screenshot-OCR) over self-description.
- **Phase 4 (prioritized next):** "Add a quote" is the hero of the product, not a form buried in settings. AI extracts from a photo/paste/forward; the human confirms. Optimize this path above all else.
- **Phase 5/6:** the human confirms, never creates. Drafted touches and suggested replies are shown for one-tap approval. Show the scheduled chase (in their voice, with times) the instant a quote is added — proof of value even before the number goes live.
- **Everywhere:** every form field asks "can AI prefill this?"; every screen has one obvious next action; integrations/teams/analytics stay greyed.

**(c) Top-5 leverage for winning/keeping early customers (ranked)**
1. **No dead end:** onboarding -> app -> "Add your first quote." Momentum is survival.
2. **First-quote intake that feels like magic:** snap/paste/forward -> AI-extracted prospect -> confirm. This is the value moment; make it 15 seconds.
3. **Show the chase before any send:** the moment a quote lands, show the 4 drafted follow-ups and their send dates. Value is visible even while the number is still activating.
4. **Website-driven onboarding:** cut the wizard to confirmations by inferring trade/description/voice from their site.
5. **Voice that sounds like them from real samples,** pre-generated so the reveal is instant. This is the "holy shit" moment that earns the testimonial.

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

## SMS compliance (registered behavior) — the app MUST always match what we registered with the carriers

These are hard product requirements, not guidelines. The 10DLC campaign was registered describing exactly this behavior; drift is a compliance violation.

1. **First-message identification + opt-out.** The first message to any prospect always identifies the contractor (business/name) and includes the exact phrase "Reply STOP to opt out."
2. **Opt-out keywords halt everything.** `STOP`, `OPTOUT`, `CANCEL`, `END`, `QUIT`, `UNSUBSCRIBE`, `REVOKE`, `STOPALL` (case-insensitive) immediately halt all messaging to that number (set the prospect `opted_out`, suppress across every quote forever, cancel pending sends). Send exactly one confirmation: `You have successfully been unsubscribed. You will not receive any more messages from this number. Reply START to resubscribe.`
3. **HELP/INFO reply.** `HELP` or `INFO` returns exactly: `ReKnock quote follow-ups on behalf of your contractor. Reply STOP to unsubscribe. Msg & Data Rates May Apply.`
4. **No links in outbound texts.** Never embed URLs/links in any automated outbound message. Phone numbers are allowed. (Applies to the `followup_drafter` prompt guardrails and any template.)
5. **Consent required + recorded per prospect.** Only message prospects whose consent path is recorded: `verbal_at_quote` or `web_form`. Store the consent path (and timestamp/source) on each prospect; never message a prospect with no recorded consent path. Manual and OCR intake must capture the consent path; email/web intake records its own path.
6. **Sequence shape.** Typical sequence is 1 to 4 messages over ~20 days, stopping on any reply. Per-prospect "remind me later" rescheduling at the prospect's request is allowed. Quiet hours + TCPA floor from Phase 5 still apply.

Implementation notes: keywords + confirmations live in the Twilio inbound handler (Phase 3/5); the "no links" and identification rules are guardrails in the drafting prompts (section 4); consent-path storage needs a `prospects.consent_path` + `consent_captured_at` column (added in `onboarding_v2`) and a required field in every intake path.

## Reminders / scheduled messages (registered 10DLC behavior — build in Phases 5/6)

Registered behavior, so it is a hard requirement, not optional. Depends on the Phase 5 sending engine (Inngest) and the Phase 6 prospect thread, so build it there — do not stub it against missing foundations.

1. From any prospect/conversation, the contractor can set a reminder to contact that homeowner at a future date/time, including months out ("circle back in March").
2. Two modes: **(a) Remind me** — at that time the contractor gets a text/notification with one tap to send a drafted message; **(b) Schedule it** — the AI-drafted message (contractor's voice, references the earlier quote and that they asked us to circle back) sends automatically at that time, within sending hours.
3. When a prospect reply implies timing ("not until spring", "call me next month"), the reply classifier detects it and suggests the reminder with the date pre-filled, one tap to confirm.
4. Scheduled messages evaluate sending windows, TCPA quiet hours, and opt-out status **at send time, not at schedule time** (a STOP between now and then must cancel it).
5. Show upcoming reminders/scheduled sends in the prospect thread as greyed future bubbles (same treatment as scheduled sequence steps), plus one place to see all upcoming ones.

Data: a `reminders` (or reuse `messages` with `scheduled_for` + a `kind`) table; whichever, keep the `messages` ledger idempotent and opt-out-checked at send. This is a superset of the default sequence, so implement the sequence engine and reminders on the same scheduled-send primitive.

---

## Platform admin (single admin, one login, /admin)

Founder-only. Not a separate login: the founder is also a normal ReKnock user; admin is a capability layered on that one account.

1. `users.platform_admin boolean default false`, seeded true for the founder's email. Everything gates on this flag, server-side.
2. `/admin` routes are server-gated on `platform_admin`. Non-admins get a **404** (notFound()), never a permission error, so the surface is not advertised. An "Admin" toggle appears in the avatar menu only for the admin, switching between their own customer UI and the admin dashboard. No separate auth flow ever.
3. **Customers table:** company name, trade, email, signup date, subscription status + plan, trial usage, number provisioning status, 10DLC status, prospect count, messages sent, last activity. Searchable + sortable. (Reads cross-tenant via the service-role client, only inside admin-gated routes.)
4. **Customer detail:** profile, voice profile, prospects, message threads, sequence state, recent `events` + `failed_jobs`.
5. **Suspend / delete:** suspend = pause all sending + access; delete = full removal incl. cancel Stripe subscription + release Twilio number. Both behind a type-to-confirm modal.
6. **View-as-customer (support mode):** from a customer detail page, enter their app UI exactly as they see it, with a persistent banner ("Viewing as {company}, exit"). Implemented as an admin-only impersonation context (signed, server-set, never client-forgeable), scoped so RLS/queries resolve to the target company.
7. In support mode the admin can do anything the customer can (fix a prospect, edit a campaign, retry a failed send, adjust settings) for unbreaking things + manual onboarding help.
8. **Audit:** every admin action and every support-mode session is written to an append-only audit log (`events` with an `admin_*` type, or a dedicated `admin_audit` table) with actor, target company, action, timestamp.

Security (CISO): impersonation must be server-side and unforgeable (do not trust a client cookie/param alone); admin cross-tenant reads only within `/admin`; never widen RLS. Build after the core loop; it is operational leverage, not customer value.

## 9. Testing priorities (in this order)

1. The freeze race: reply arrives while a touch job is mid-flight → no send.
2. Idempotency: the same touch job runs twice → exactly one message.
3. Consent suppression: an `opted_out` phone blocks sends across all of that company's quotes.
4. Quiet-hours / sending-window rescheduling across timezones and DST.
5. Trial cap boundary: the 50th message sends, the 51st freezes and notifies.

Everything else can be manual QA at this scale.
