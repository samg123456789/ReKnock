# ReKnock — Product Decisions

## Decision 1: Quote-first, not CRM-first

**Choice:** Make adding a quote the primary workflow.

**Why:** Contractors do not need another database to maintain. They need a fast way to keep an existing opportunity alive.

**Tradeoff:** The product gives up broad pipeline-management features in exchange for a shorter path to value.

## Decision 2: Four touches, then stop

**Choice:** Use a short sequence spaced across several days, with a hard unanswered-contact cap.

**Why:** The messages should feel like professional follow-up, not a marketing campaign. A finite sequence also makes the promise easy to understand and operate safely.

**Tradeoff:** Some long-cycle opportunities will need a deliberate reactivation flow later.

## Decision 3: Freeze on reply

**Choice:** Any homeowner reply pauses automated follow-up immediately.

**Why:** The highest-risk failure is continuing to automate after a real conversation starts. The contractor should own that moment.

**Tradeoff:** ReKnock may miss an opportunity to automate simple replies, but it earns trust and keeps the early product legible.

## Decision 4: Compliance as a product feature

**Choice:** Put consent, identification, opt-out, pacing, and auditability into the enrollment and send paths.

**Why:** Messaging compliance is inseparable from customer experience and sender reputation.

**Tradeoff:** The product has more friction than an ungoverned bulk sender, by design.

## Decision 5: Measure recovered revenue, not activity

**Choice:** The long-term dashboard centers on replies, won quotes, and revenue recovered.

**Why:** Sends and clicks are easy to count but do not prove the product helped a contractor win work.

**Tradeoff:** Revenue attribution requires disciplined status updates and honest customer reporting.
