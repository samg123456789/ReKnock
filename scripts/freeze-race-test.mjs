// Freeze-race test (CLAUDE.md testing priority #1): a homeowner reply and a
// due touch fire within milliseconds of each other -> exactly one of them may
// win the scheduled row, and if the reply wins the prospect, no send happens.
//
// Runs against the dev Supabase via the Management API (same SQL the app
// issues through PostgREST: single autocommit statements). Replicates the
// engine's real statement order:
//   sender:  claim (scheduled->queued conditional UPDATE) ... draft (sleep)
//            ... recheck prospect status ... send or cancel
//   webhook: prospect -> 'replied', then cancel scheduled rows
//
// Runs in CI (.github/workflows/freeze-race.yml) on every push to dev and
// locally via: node scripts/freeze-race-test.mjs
// SUPABASE_ACCESS_TOKEN comes from the environment (CI secret) or .env.local.
//
// Because this file replicates the engine's SQL rather than importing it, a
// refactor of the send path would not automatically fail the race below. The
// static check first is the tripwire for that: it fails if the
// frozen_after_claim recheck in send-scheduled-message stops sitting between
// drafting (generateText) and the Twilio call (sendClaimedMessage).

import { readFileSync } from "node:fs";

const PROJECT_REF = "hgmjkugxrsxxarjdgevc"; // reknock-dev
const ITERATIONS = 12;

// --- Static tripwire on the real engine code -------------------------------
{
  const src = readFileSync(new URL("../lib/inngest/functions.ts", import.meta.url), "utf-8");
  const claim = src.indexOf('.update({ status: "queued" })');
  const draft = src.indexOf("generateText(");
  const recheck = src.indexOf('"frozen_after_claim"');
  const send = src.indexOf("sendClaimedMessage(");
  const ordered = claim > -1 && draft > claim && recheck > draft && send > recheck;
  if (!ordered) {
    console.error(
      "STATIC CHECK FAILED: send-scheduled-message must claim (scheduled->queued), draft, THEN recheck prospect status (frozen_after_claim) immediately before sendClaimedMessage.",
      { claim, draft, recheck, send },
    );
    process.exit(1);
  }
  console.log("static check OK: claim -> draft -> frozen_after_claim recheck -> send order intact\n");
}

let token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
if (!token) {
  try {
    const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
    token = envFile.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]?.trim();
  } catch {
    /* no .env.local (CI) */
  }
}
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN not set (env var or .env.local)");

// Management API calls retry on 429/5xx: CI runners reach api.supabase.com
// much faster than a laptop, so a run can outpace the per-token rate limit
// that a local run never hits.
// Backoff reaches ~60s total: the Management API limit is a per-minute
// window, so back-to-back CI runs (one queued behind another) can start into
// a fully saturated window and need to ride it out, not just blip-retry.
async function sql(query) {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt) await sleep(2000 * 2 ** (attempt - 1));
    const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (resp.ok) return resp.json();
    const text = await resp.text();
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(
        `SQL ${resp.status}: the SUPABASE_ACCESS_TOKEN this run used is invalid or unauthorized. ` +
          `In CI that means the GitHub Actions secret needs to be re-added with the current token value. (${text})`,
      );
    }
    lastErr = new Error(`SQL ${resp.status}: ${text}`);
    if (resp.status !== 429 && resp.status < 500) throw lastErr;
  }
  throw lastErr;
}

// CI logs are not readable by every operator, so the run reports its own
// outcome into the dev DB (best-effort): a pass writes an events row, a
// failure writes the exact error to failed_jobs. A CI failure with NEITHER
// row present means the run could not authenticate at all (bad secret).
const runMeta = () => ({
  run_id: process.env.GITHUB_RUN_ID ?? null,
  sha: process.env.GITHUB_SHA ?? null,
  source: process.env.GITHUB_ACTIONS ? "ci" : "local",
});
async function reportOutcome(ok, detail) {
  const payload = JSON.stringify({ ...runMeta(), ...detail }).replace(/'/g, "''");
  try {
    if (ok) {
      await sql(`insert into events (company_id, type, payload) values (null, 'ci_freeze_race_pass', '${payload}'::jsonb);`);
    } else {
      const err = String(detail.error ?? "unknown").replace(/'/g, "''").slice(0, 2000);
      await sql(`insert into failed_jobs (job_type, payload, error) values ('ci_freeze_race', '${payload}'::jsonb, '${err}');`);
    }
  } catch {
    /* reporting is best-effort; never mask the real outcome */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup() {
  const [co] = await sql(`select id from companies where is_internal = true limit 1;`);
  if (!co) throw new Error("no internal test company found");
  const [p] = await sql(`
    insert into prospects (company_id, first_name, phone_e164, status, source, consent_path, consent_captured_at)
    values ('${co.id}', 'RaceTest', '+15550001111', 'sequencing', 'manual', 'verbal_at_quote', now())
    returning id;`);
  const key = `touch:${p.id}:0`;
  const [m] = await sql(`
    insert into messages (company_id, prospect_id, direction, channel, kind, status, scheduled_for, sequence_step, idempotency_key)
    values ('${co.id}', '${p.id}', 'outbound', 'sms', 'sequence', 'scheduled', now(), 0, '${key}')
    returning id;`);
  return { companyId: co.id, prospectId: p.id, messageId: m.id };
}

// The sender path, statement-for-statement what sendScheduledMessage does
// after its pre-checks. Returns what it would have done.
async function senderPath(prospectId, messageId, draftMs) {
  const claimed = await sql(`
    update messages set status='queued' where id='${messageId}' and status='scheduled' returning id;`);
  if (!claimed.length) return "no_claim"; // freeze got the row first
  await sleep(draftMs); // Haiku drafting window
  const [p2] = await sql(`select status from prospects where id='${prospectId}';`);
  if (["replied", "opted_out", "won", "lost", "paused"].includes(p2.status)) {
    await sql(`
      update messages set status='canceled', send_meta='{"reason":"frozen_after_claim"}'
      where id='${messageId}' and status='queued';`);
    return "frozen_after_claim";
  }
  await sql(`update messages set status='sent', sent_at=now() where id='${messageId}';`);
  return "sent";
}

// The webhook freeze, statement-for-statement.
async function webhookFreeze(prospectId, delayMs) {
  await sleep(delayMs);
  await sql(`update prospects set status='replied' where id='${prospectId}';`);
  const t = Date.now(); // freeze committed at this instant
  await sql(`
    update messages set status='canceled', send_meta='{"reason":"replied"}'
    where prospect_id='${prospectId}' and status='scheduled' and kind='sequence';`);
  return t;
}

let failures = 0;
let completed = 0;
try {
  for (let i = 0; i < ITERATIONS; i++) {
    await raceOnce(i);
    completed++;
  }
} catch (e) {
  console.error(`\nABORTED at iteration ${completed + 1}/${ITERATIONS}:`, e.message ?? e);
  await reportOutcome(false, { error: e.message ?? String(e), completed_iterations: completed });
  process.exit(1);
}

async function raceOnce(i) {
  const { prospectId, messageId } = await setup();
  // Sweep the reply across the sender's whole flight, including mid-"drafting".
  const draftMs = 400;
  const replyDelay = Math.floor((i / ITERATIONS) * 900);
  const sendStart = Date.now();
  const [senderResult, freezeAt] = await Promise.all([
    senderPath(prospectId, messageId, draftMs),
    webhookFreeze(prospectId, replyDelay),
  ]);
  const [row] = await sql(`select status from messages where id='${messageId}';`);
  const [pr] = await sql(`select status from prospects where id='${prospectId}';`);

  // Invariants: the row must end in exactly one terminal state, and if it was
  // 'sent', the freeze must have landed after the sender's final recheck
  // (i.e. truly simultaneous, not a missed freeze).
  const ok =
    (row.status === "canceled" && senderResult !== "sent") ||
    (row.status === "sent" && senderResult === "sent" && freezeAt > sendStart);
  if (!ok) failures++;
  console.log(
    `#${String(i + 1).padStart(2)} replyDelay=${String(replyDelay).padStart(3)}ms sender=${senderResult.padEnd(18)} row=${row.status.padEnd(8)} prospect=${pr.status} ${ok ? "OK" : "FAIL"}`,
  );
  // Cleanup (test rows only).
  await sql(`delete from messages where id='${messageId}';`);
  await sql(`delete from prospects where id='${prospectId}';`);
}

console.log(failures === 0 ? `\nPASS: ${ITERATIONS}/${ITERATIONS} races resolved to a single outcome, no send after freeze.` : `\nFAIL: ${failures} bad interleavings`);
await reportOutcome(failures === 0, failures === 0 ? { iterations: ITERATIONS } : { error: `${failures} bad interleavings`, iterations: ITERATIONS });
process.exit(failures === 0 ? 0 : 1);
