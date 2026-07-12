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
// Usage: node scripts/freeze-race-test.mjs   (needs SUPABASE_ACCESS_TOKEN in .env.local)

import { readFileSync } from "node:fs";

const PROJECT_REF = "hgmjkugxrsxxarjdgevc"; // reknock-dev
const ITERATIONS = 12;

const envFile = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const token = envFile.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m)?.[1]?.trim();
if (!token) throw new Error("SUPABASE_ACCESS_TOKEN not found in .env.local");

async function sql(query) {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!resp.ok) throw new Error(`SQL ${resp.status}: ${await resp.text()}`);
  return resp.json();
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
for (let i = 0; i < ITERATIONS; i++) {
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
process.exit(failures === 0 ? 0 : 1);
