# Company OS: Product Agent v1

The Product Agent is the first always-on Company OS agent. It runs from hosted
infrastructure, not from a local Codex session.

## What it does

1. Receives GitHub `push` webhooks at `/api/webhooks/github`.
2. Verifies the GitHub signature with `GITHUB_WEBHOOK_SECRET`.
3. Persists the raw event in `agent_events`.
4. Enqueues `product/github.push` in Inngest.
5. Summarizes the push into:
   - a plain-English changelog entry
   - customer impact
   - product ideas
   - UX notes
   - growth/revenue notes
   - risks
   - action items
6. Stores the run in `product_agent_runs` and `product_changelog_entries`.
7. Emails the summary to `PRODUCT_AGENT_EMAIL_TO`.
8. Shows the output in `/admin/company-os`.

## Required setup

Apply the Supabase migration:

```bash
supabase db push
```

Set production environment variables:

```bash
GITHUB_WEBHOOK_SECRET=...
PRODUCT_AGENT_EMAIL_TO=samuelgoldberg98@gmail.com
RESEND_API_KEY=...
ANTHROPIC_API_KEY=...
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...
```

Create a GitHub repository webhook:

- Payload URL: `https://YOUR_DOMAIN/api/webhooks/github`
- Content type: `application/json`
- Secret: the same value as `GITHUB_WEBHOOK_SECRET`
- Events: `push`

## Guardrails

- Internal-only: the Product Agent does not contact customers.
- No spending: it cannot purchase, upgrade, or change paid plans.
- No public posting: it does not publish changelog entries externally.
- Human approval required for pricing, positioning, public claims, payments,
  or risky production changes.
