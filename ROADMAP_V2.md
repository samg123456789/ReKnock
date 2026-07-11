# ReKnock Roadmap V2 — strategy, not a build order

> **MVP first, non-negotiable.** Nothing here is built until the current queue works end to end (onboarding overhaul, admin, Phases 2-6, passing acceptance test). This document is thinking. It reuses our exact stack — Postgres, Inngest, Haiku, Twilio, Resend — and flags anything that would add a vendor or a bill.

The one metric everything is scored against: **how fast a contractor sees a real quote chased, and how fast that turns into a won deal.** Features that don't move that are "later or never."

---

## PART 1 — MVP AUDIT (ruthless)

Score = does it directly serve first-week value (chase a real quote, win a deal)?

| Scoped item | Score | Verdict |
|---|---|---|
| Auth + $1 checkout + paywall | Enabler | Keep. Necessary gate, not value. Verify the $1-charges-today path. |
| Onboarding: website-inferred, voice from samples | **High** | Keep. The voice reveal is the "holy shit." Already infer-and-confirm. |
| Add-a-quote (photo/PDF/paste/type → extract → confirm) | **Highest** | Keep. This *is* the value moment. Protect it. |
| Sequencing engine (4 touches, freeze on reply, windows, cap) | **Highest** | Keep. The product. |
| Inbound STOP/HELP/reply-freeze + relay | **High** | Keep. Compliance + the "hands you the conversation" promise. |
| Admin dashboard + view-as | Enabler | Keep, but it's *our* operational leverage (manual onboarding, unbreaking), not customer value. Build lean. |
| Sending-schedule 7-day editor | Medium | **Simplify.** One recommended default + accept; the full grid is settings, not onboarding. (Done: apply-to-all.) |
| CSV import (200 rows) | Low | **Cut from MVP.** Batch import is not first-week value for a solo roofer; revisit if a Crew asks. |
| Multiple campaigns at enrollment | Low | **Cut/defer.** One good default beats a builder no one has data to tune yet. |
| Reply relay "1)/2)" disambiguation | Low now | **Defer.** Single active conversation is the common case at launch. |
| Founder copy-review queue before first send | Medium | **Keep but one-click**, protects shared sender reputation while on sole-prop 10DLC. |

**Missing but cheap + high-leverage (pull into late MVP / first fast-follow):**
- **Revenue-recovered number** on the dashboard ("we've chased $X, you marked $Y won"). Pure SQL over `events`/`prospects`. This is the retention and word-of-mouth engine and it's nearly free.
- **First-run "watch it work" demo:** the instant a quote is added, show the 4 drafted texts + dates (already do the dates; add the drafted copy). Proof before the number is even live.
- **Missed-call text-back** is the single highest-leverage *new* capability and it's cheap on Twilio we already run — but it's V2 Pro, not MVP.

---

## PART 2 — VERSION 2.0 PRODUCT DESIGN

For each pillar: the 20% that delivers 80%, then architecture on existing infra.

### Pillar A — The agentic layer (the $199 tier)

Progression from "human confirms everything" to "agent runs the pipeline," gated by trust.

- **Level 1 (today):** AI drafts, human approves/sends via relay.
- **Level 2 (the 80/20 of A):** the agent auto-handles the *routine tail* — answers factual questions it can ground in the quote + the contractor's profile ("what's included?", "how long does it take?"), runs "what times work?" scheduling, books onto the contractor's calendar, and **escalates the instant intent/sentiment shifts** (price talk, complaint, ready-to-buy). This is where the money and the trust are. Build this; it earns the tier.
- **Level 3 (later):** full pipeline — notices stale quotes, revives dead leads on triggers (roof after a hail event, seasonal), asks for reviews on won jobs, requests referrals. Mostly cron sweeps; lower per-feature value than L2, do piecemeal.

**Trust mechanics (these are the product, not a setting):**
- **Per-conversation autonomy dial:** Draft-only → Auto-answer-questions → Auto-schedule → Full. Default conservative; the contractor raises it as trust grows.
- **"Always ask me about X" rules** (price, scope changes, anything mentioning money) — stored per company; a match forces escalation regardless of dial.
- **Hard stops that always escalate, never autonomous:** opt-out language, complaints, negotiation, legal/warranty. Encoded, not learned.
- **Full transcript visibility + undo/takeover at any moment:** every agent turn is a normal (greyed, "sent by agent") bubble in the thread; a "Take over" button freezes the agent on that conversation instantly (reuse the same `prospect/replied`-style freeze event).

**Architecture (all on current infra):**
- **Model routing (`lib/ai.ts` already swappable per call):** Haiku for classify/draft/extract/answer-from-context (99% of turns, pennies). Escalate to a bigger model (Sonnet) *only* for (a) the escalate/don't-escalate decision when Haiku's confidence < 0.7, (b) negotiation/complaint nuance. Never route to a big model by default — cost discipline is a routing rule, not a vibe.
- **Agent memory per prospect on Postgres (no vector DB):** one `prospect_memory` row per prospect — a small jsonb of durable facts (known constraints, preferences, commitments made, next action, last-agent-summary). The agent reads that row + the last N `messages` each turn; writes an updated summary each turn. At contractor scale (hundreds of prospects, short threads) this beats embeddings/RAG and adds no vendor. Full history already lives in `messages`; `events` is the audit.
- **Orchestration:** Inngest functions we already run. An inbound reply → classify → if within autonomy + not a hard-stop → agent turn (draft + guardrail + send via the existing idempotent `sendSms`) → update memory. Scheduling back-and-forth is a short Inngest state machine; calendar booking needs **one** new dependency (calendar), see below.
- **Guardrails reuse `enforceCompliance()`** (no links, STOP line, 320 chars) plus the escalation ruleset. No model output reaches a homeowner on an escalation trigger — invariant preserved.
- **Cost per conversation:** ~5-15 Haiku turns × a few hundred tokens = well under $0.05 AI; SMS dominates at ~$0.01/segment. A fully-agented conversation costs cents — trivially supports $199.
- **New bill, justified:** calendar booking (Level 2) needs read/write to the contractor's calendar. Cheapest path: Google Calendar API (free) via OAuth, not a scheduling vendor (no Calendly bill). Justified because "books the appointment" is the L2 10x moment. Everything else in A reuses what we run.

### Pillar B — Intake everywhere (Ramp's `receipts@` taken further)

**80/20:** missed-call text-back + mobile share-sheet. Both are cheap and reuse our stack; together they capture the leads a solo contractor drops today.

- **Missed-call text-back (highest-leverage new intake):** Twilio (already ours) — on a missed/voicemail on the ReKnock number, auto-text "Sorry I missed you, it's {name} at {business}. What can I quote for you?" and open a prospect. Reuses `sendSms` + inbound webhook. ~Zero new cost.
- **Voicemail transcription → prospect note:** Twilio voice `<Record transcribe>` (built-in) or Haiku on the recording; attach to the prospect. No new vendor.
- **Mobile share-sheet (the Ramp move):** a PWA share-target so the contractor shares any screenshot/PDF from their phone straight into ReKnock → the extractor we already built runs. Cheap; huge "zero data entry" feel. No app store, no new infra.
- **`quotes@`/BCC email** — already planned (Resend inbound). Keep.
- **Later or never:** Facebook lead-form ingestion (Meta app-review + token upkeep; only when a cohort lives on FB leads), and QuickBooks/Jobber/Housecall Pro estimate sync (real integration lift + their review cycles) — Pro-tier, demand-triggered, not speculative.

### Pillar C — Channels (make the greyed Pro cards real)

Marketing already promises missed-call text-back, review requests, Zapier, Jobber/HCP, WhatsApp on Pro. V2 must deliver exactly those.

- **Email as a second sequence channel (80/20, cheapest):** `messages.channel` is already channel-aware; Resend is already ours. A prospect with an email but a bad/absent number still gets chased. Near-free.
- **Review-request campaigns (huge ROI):** on "mark won," trigger a Google-review ask. **Compliance flag:** our SMS 10DLC campaign is registered *no-links*; a review link over SMS needs a *separate* registered campaign, or send the review ask over **email** (recommended first — free, link-friendly). Decide: email-first for reviews.
- **WhatsApp:** Twilio WhatsApp (same vendor, per-conversation fee) gated per-contact via `messages.channel`. Real but demand-triggered; the per-conversation fee is the only new cost and it's usage-passed-through.
- **Zapier:** a thin REST endpoint (create prospect) + outbound hooks on `quote.won/lost/replied`. Cheap; unlocks the long tail of integrations without us building each.

### Pillar D — Intelligence (the invoice-justifying number)

**80/20:** the revenue-recovered report. It's SQL over data we already store and it's the single best retention + referral asset.

- **Close-rate & revenue-recovered report:** "ReKnock chased $84k in quotes and won you $23k back this quarter." Pure SQL over `prospects` (quote_amount, status) + `events` + `messages`. Monthly email via Resend. Near-zero cost, disproportionate value — build early in V2.
- **Best-time-to-send per market:** aggregate reply timestamps by market (SQL); nudge send windows. Cheap, compounding.
- **Quote-size-aware sequencing:** branch cadence/tone by `quote_amount` (an $80k roof deserves a different rhythm than an $800 repair). Config on the campaign; cheap.
- **Seasonal/weather triggers:** the *value* is real (hail → roof revival) but live weather data is a new dependency. 80/20 = a contractor-triggered **"Storm mode"** button (blast a revival campaign to dead roofing leads in an area) — zero new vendor. A free NOAA/weather.gov feed can automate it later; do not buy a weather vendor.

### Pillar E — Team (Crew tier)

**80/20:** multiple estimators, per-estimator number + close rate, owner dashboard. Approval flows are lower value; defer.

- **Architecture:** `users.company_id` already scopes a company to many users; add an estimator role + assign prospects to an estimator; per-estimator number via the same provisioning path (multi-number is post-MVP debt to unwind — see Part 4). Owner dashboard is the Pillar-D report sliced by estimator. Reuses everything; the real work is per-estimator number provisioning and reporting rollups.

---

## PART 3 — PRICING & PACKAGING

Ladder: **Solo $29-39 → Pro $79 → Crew $149 → Agent $199+.** Every jump needs a 10x moment.

| Tier | Value story a roofer repeats | 10x moment (makes upgrade obvious) | Gross margin | Gating |
|---|---|---|---|---|
| **Solo $29/39** | "It texts my quotes back for me, in my voice, and stops the second they reply." | The MVP itself vs. doing nothing. | ~75%+ (COGS ≈ number $1 + a few $ SMS + pennies AI) | Usage-gated: fair-use message cap; tier-gated: one number, no integrations. |
| **Pro $79** | "Every lead, from everywhere, chased — plus the reviews that win me the next job." | **Missed-call text-back + review requests**: more leads in the top, more 5-stars out the bottom, automatically. | ~80% (mostly the same COGS; more SMS volume passed through) | Tier-gated: intake-everywhere, email/review channels, Zapier, integrations. |
| **Crew $149** | "My whole crew's follow-up in one place, and I see each estimator's close rate." | **Per-estimator accountability + owner dashboard** — the owner finally sees who closes. | ~80% (adds a few numbers) | Tier-gated: seats, multi-number, rollup reporting. |
| **Agent $199+** | "It books my appointments and revives my dead leads while I'm on the roof." | **The agent books the appointment and revives leads** — found money, zero effort. | ~78% (AI is pennies; the price is value-based, not cost-based) | Usage-gated: agented-conversations/month; tier-gated: autonomy Levels 2-3, calendar. |

- **Founding $29 locked for life** (first 20) stays — scarcity + testimonials, already built.
- **Why $199 works:** it's priced on outcome (a booked appointment is worth hundreds to a contractor), not on our cost (cents). The agent is the only feature worth a 2.5x jump and it's defensible.
- **Usage vs tier:** channels/intake/team are *tier*-gated (capability). Message volume and agent conversations are *usage*-gated (cost + fairness). Keep the trial's hard 50-cap logic as the usage-metering primitive we already built.

---

## PART 4 — SEQUENCING BY LEVERAGE

Ordered by value/effort. Effort: S (days), M (1-2 wks), L (3+ wks).

| # | Item | Pillar | Build trigger | Effort | Depends on |
|---|---|---|---|---|---|
| 1 | Revenue-recovered report + dashboard number | D | The moment real won/lost data exists | S | MVP won/lost tracking |
| 2 | Email as 2nd sequence channel | C | SMS-only is capping reachable leads | S | Resend inbound, `messages.channel` |
| 3 | Missed-call text-back + voicemail transcript | B | First churn/"I missed a lead" feedback, or Pro launch | M | Twilio voice webhook |
| 4 | Review requests (email-first) | C | After first cohort marks jobs won | S | won-trigger, Resend |
| 5 | Mobile share-sheet intake (PWA) | B | Contractors complain about typing quotes | M | extractor (built) |
| 6 | Zapier in/out | C | 2-3 customers ask for a tool we don't integrate | M | REST + hooks |
| 7 | Agent Level 2 (auto-answer + schedule + book) | A | Reply volume > ~30/day across customers AND trust proven; or explicit demand | L | conversation infra, `prospect_memory`, calendar OAuth |
| 8 | Crew tier (multi-estimator) | E | A multi-estimator shop commits to pay | L | per-tenant/per-estimator numbers |
| 9 | Jobber/HCP/QuickBooks sync | B | ≥N customers live on one of them ask | L | their APIs |
| 10 | Weather/seasonal automation | D | Storm-mode (manual) proves demand | M | free NOAA feed |
| — | Facebook lead forms, WhatsApp | B/C | A cohort actually lives there | M each | Meta/Twilio-WA review |

**Technical debt taken in V1 — and when it must be repaid:**
- **Sole-prop 10DLC → standard brand + per-tenant registration.** V1 uses one manual sole-prop registration (founder's number) with a copy-review gate. Repay when: throughput hits sole-prop caps OR customer count > ~20. Then automate per-tenant brand/campaign via Twilio TrustHub API during onboarding (Phase 3's real form). This is the biggest scaling debt.
- **Single shared number → per-tenant numbers.** The inbound webhook currently resolves a prospect by the *From* phone only, not scoped by the ReKnock (*To*) number. Fine for one tenant; **must** scope by `To → phone_numbers → company` before real multi-tenant, or replies cross wires. Repay before onboarding customer #2 onto their own number.
- **Relay session simplicity.** One active conversation assumed; add session/disambiguation when a contractor runs several concurrent replies.
- **Queue at scale.** Inngest covers current volume; revisit concurrency/fan-out only when daily send volume is large. No action now.
- **Founder copy-review gate.** Intentional friction protecting shared reputation on sole-prop; removed automatically once per-tenant standard brands land.
