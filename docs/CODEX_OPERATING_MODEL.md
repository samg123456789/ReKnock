# ReKnock Codex operating model

## Purpose

Codex is the control plane for ReKnock's internal product and engineering work.
The ReKnock web app is the product for contractors and the production system
that serves them. It is not an AI command center.

## What Codex owns

- Product decisions and priorities.
- Repository investigation and implementation.
- Bug diagnosis, reliability work, tests, and migrations.
- Pull requests, reviews, deployment preparation, and release checks.
- Drafting product, UX, and growth recommendations for human review.

## What the web app owns

- Customer accounts, companies, quotes, messages, billing, and onboarding.
- Production background jobs required by the customer workflow.
- Operational data and customer-facing permissions.
- Safe, explicit product actions that belong in the live application.

## Priority order

1. Protect trust and customer safety, especially reply-stop behavior and data
   isolation.
2. Keep the core quote follow-up workflow reliable.
3. Improve activation, first quote completion, and customer retention.
4. Improve revenue and growth only when the first three are healthy.
5. Polish secondary UI and internal tooling last.

## How to direct Codex

Start work with a concrete outcome and a definition of done. For a risky or
multi-file change, plan first. Use a durable goal when the work spans multiple
turns. Queue follow-up work that should happen after the current turn. Steer
only when the current direction is wrong. Review the diff before deployment.

Useful prompt shape:

```text
Outcome: [what must be true]
Priority: [why this matters now]
Constraints: [what must not change]
Done when: [tests, route, or user flow that proves it]
```

## Execution boundaries

- Diagnose before editing when the cause is uncertain.
- Do not deploy, change production data, spend money, or contact customers
  without explicit approval for that action.
- Keep changes scoped to the stated outcome.
- Run the narrowest useful verification, then the production build for app
  changes.
- Record important decisions and known follow-ups in repository documentation.

## Retired hosted agent layer

The former hosted Company OS implementation was intentionally removed from the
runtime. Its Supabase migrations and historical tables remain so removal does
not destroy data or rewrite migration history. The old Company OS documents are
historical and are not an instruction to restore that architecture.
