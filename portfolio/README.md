# ReKnock — Product Case Study

## One-line summary

ReKnock is a lightweight follow-up assistant for residential contractors who lose work because quotes go unanswered.

## The problem

Contractors spend time creating estimates, but follow-up often happens once—or not at all. The failure is rarely a lack of selling skill. It is the gap between sending a quote and finding time to politely check in again while running the jobsite.

The product needed to feel useful in under ten minutes, work from a phone, and avoid becoming another CRM that requires daily data entry.

## The product

ReKnock turns a quote into a short, scheduled follow-up sequence. Messages are written in the contractor's voice and stay focused on the quote the homeowner requested. When the homeowner replies, automated follow-up stops immediately and the contractor receives the conversation to handle personally.

## My contribution

I defined the product behavior, customer experience, operating model, and technical direction across:

- onboarding and quote intake
- message sequencing and pause-on-reply behavior
- SMS consent and opt-out handling
- contractor voice and message-quality controls
- billing and trial design
- delivery monitoring and operational safeguards
- the path from human-approved drafts to bounded agent assistance

## Key design decisions

### Make the value moment immediate

The first useful action is adding a real quote—not configuring a pipeline. The experience is organized around getting from quote to visible follow-up plan as quickly as possible.

### Treat replies as a hard handoff

The moment a homeowner replies, the automated sequence freezes. This is both a trust promise and a reliability invariant.

### Build compliance into the workflow

Consent confirmation, opt-out handling, message limits, quiet hours, and audit events are product behavior—not a policy page added after the fact.

### Prefer focused automation over a broad CRM

ReKnock owns one painful job: following up on open quotes. The product stays intentionally narrow so a contractor can use it between appointments.

## What success should be measured by

The meaningful measures are operational and customer-facing:

- time from signup to first quote
- percentage of sequences that reach a reply
- time from reply to contractor handoff
- quotes marked won after follow-up
- revenue recovered from previously unanswered quotes
- opt-out and delivery-failure rates

No fabricated testimonials or unsupported performance claims are included here. The next credibility step is replacing these evaluation targets with anonymized, verifiable customer evidence.

## What is intentionally not public

This case study omits source implementation, production credentials, customer records, internal runbooks, and vendor configuration. Reviewers can see the reasoning and system shape without receiving material that should remain private.

## Related material

- [System design](SYSTEM_DESIGN.md)
- [Product decisions](PRODUCT_DECISIONS.md)
- [Live product site](https://getreknock.com)
