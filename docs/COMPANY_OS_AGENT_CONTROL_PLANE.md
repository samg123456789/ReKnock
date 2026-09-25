# Archived: Company OS agent control plane

> This hosted implementation was retired on 2026-09-25. It is kept as
> historical documentation only. The active internal operating model is
> `docs/CODEX_OPERATING_MODEL.md`.

This is the shared foundation for ReKnock's three continuously operating
internal agents:

- **Compass**: product intelligence, roadmap recommendations, and internal
  task creation.
- **Forge**: failed-job, failed-run, reliability, security-minded, and
  technical-debt monitoring.
- **Signal**: marketing content drafts and channel experiment ideas. Signal
  never publishes or sends anything automatically.

## Architecture

The control plane is hosted by the existing Next.js, Supabase, and Inngest
stack. Scheduled Inngest functions read existing Company OS and operations
signals, then write deduplicated internal tasks.

The migration `20260924120000_company_os_agent_control_plane.sql` adds:

- `agent_tasks`: queued, claimed, completed, failed, or cancelled work with
  priority, risk, retry limits, payload, result, and a unique dedupe key.
- `agent_runs`: durable records for scheduled ticks and task-level work.
- `agent_approvals`: approval-gated drafts or future risky actions. Signal
  content is stored here with `status = 'pending'`.

All three tables have RLS enabled and intentionally have no end-user policies.
The internal server code uses the existing service-role client. The typed
registry lives in `lib/company-os/agent-registry.ts`; shared idempotent task,
run, and approval helpers live in `lib/company-os/agent-control-plane.ts`.

## Schedules and permissions

| Agent | Inngest schedule | Initial behavior | External writes |
| --- | --- | --- | --- |
| Compass | `*/30 * * * *` | Converts Product Agent action items into internal tasks | None |
| Forge | `15 * * * *` | Reviews `failed_jobs`, failed Product Agent runs, and relevant risks/action items | None |
| Signal | `0 */6 * * *` | Converts recent product changelog entries into draft content and pending approvals | None |

Task claiming is atomic on status and attempt count. Duplicate ticks and
retries cannot create duplicate tasks or Signal approvals. Signal's approval
record is the durable boundary: there is no publishing integration or sender
in this slice.

The admin-only `/admin/company-os` page now shows the registry, open tasks,
pending approvals, Signal draft content, existing Product Agent output, and
run history.

## Environment variables

No new environment variables are required. The scheduled functions use the
existing server-side values:

```text
NEXT_PUBLIC_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY              # required when Signal generates a draft
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
```

The existing Product Agent variables remain unchanged, including
`GITHUB_WEBHOOK_SECRET`, `PRODUCT_AGENT_EMAIL_TO`, and `RESEND_API_KEY`.

## Exact production setup remaining

From `reknock/`, after linking the intended Supabase project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Then deploy the Next.js app with the environment variables above. In Inngest,
sync the deployed function endpoint:

```text
https://YOUR_DOMAIN/api/inngest
```

Confirm that `company-os-compass-tick`, `company-os-forge-tick`, and
`company-os-signal-tick` are registered and enabled. The existing GitHub
webhook setup from `COMPANY_OS_PRODUCT_AGENT.md` is still required for fresh
Product Agent input. Make one test push, then verify the following in
`/admin/company-os`:

1. A completed Product Agent run and changelog entry exist.
2. Compass creates a deduplicated product task.
3. Signal creates a pending approval draft.
4. Forge can see failed-job or failed-run signals when one exists.

No production schema was applied by this change, no public post or customer
email was sent, and no deployment or infrastructure mutation was performed.
