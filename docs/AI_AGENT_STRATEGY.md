# AI agents that message on behalf of our customers

How ReKnock gets from "AI drafts, engine sends on a schedule" (today) to "an AI
agent runs the whole follow-up conversation for the contractor" without
breaking carrier registration, TCPA, or customer trust. Written 2026-07-12.

## The one rule that shapes everything

Our 10DLC campaign registration and our own product invariant say the same
thing: **proactive scheduled follow-ups may be AI-drafted and auto-sent;
reactive replies to a homeowner may not.** Once a homeowner replies, a human
(the contractor) is in the loop. Any move up the autonomy ladder below that
changes reactive behavior needs (a) a product decision, (b) updated 10DLC
campaign registration language, and (c) an explicit per-tenant opt-in. Ship
nothing on the reactive side that skips those three.

That rule is not a limitation to route around. It is the moat: contractors
trust us because nothing talks to their customer that they did not sanction,
and carriers keep our throughput because our declared use case matches our
traffic.

## The autonomy ladder

Each level is shippable on its own and generates the data that makes the next
level safe. We are at level 1 with pieces of level 2.

**Level 0, done: drafted sequences.** The 4-touch chase, drafted in the
contractor's voice at send time, auto-sent inside sending windows. This is
"an AI agent messages on your behalf" already; it is just script-shaped.

**Level 1, done: perception.** Every inbound reply is classified
(interested / question / reschedule / not interested / opt-out / other) and
stored in `messages.ai_classification`. This is the eval set. Nothing acts on
it yet beyond freeze + relay.

**Level 2, build next: the agent proposes, the human taps.**
The relay ping stops being a notification and becomes a decision surface:
- Reply arrives, classifier runs, and the relay text to the contractor
  includes a drafted answer in their voice: `Sarah asked about financing.
  Suggested reply: "..." Text 1 to send it, or reply with your own words.`
- One tap ("1") sends the draft through the existing relay path. That is a
  human action, so it is compliant today with zero registration change.
- "Not until spring" replies get a pre-filled reminder proposal: `Text 1 and
  we will circle back March 1st.` (The reminders engine this rides on shipped
  2026-07-12.)
- Everything the contractor does (send as-is, edit, ignore) is logged as
  accept/reject signal per intent type. This is the flywheel: it measures
  exactly how good our drafts are, per contractor, per intent.

Level 2 is the highest-leverage build in the company: it feels like an
employee, it is cheap (one extra Haiku call per reply), and it is fully
inside the registered behavior.

**Level 3, gated: bounded autopilot on low-risk intents.**
When level 2 data shows >90% untouched-accept rate for an intent class, offer
per-tenant autopilot for that class only:
- Start with the two safest: scheduling logistics ("can you come Tuesday?" ->
  confirm + relay calendar note to owner) and simple factual answers already
  present on the quote record.
- Hard bounds: never prices, discounts, materials, or scope; max 1 autonomous
  reply per inbound before requiring the human; always footnoted to the owner
  ("ReKnock answered Sarah: ..."); instant takeover by replying; per-tenant
  kill switch; confidence floor with fallback to level 2 behavior.
- Prerequisites before any of this sends: updated 10DLC campaign description,
  explicit tenant opt-in per intent class, and an eval harness run against the
  accumulated `reply_classifications` corpus.

**Level 4, later: the agent owns the goal, not the message.** "Get this quote
answered" as the objective: the agent picks timing, channel cadence, and
content within the sequence rules, learns per-neighborhood/per-trade response
patterns from `events`, and proposes sequence edits to the contractor
("day-5 texts get 2x replies when they mention the crew schedule; want me to
update your campaign?"). Human approves campaign changes; the agent runs them.

## Architecture: why we do not need to rebuild anything

The pieces shipped today are already the agent runtime:

- **Perception**: reply classifier (per-message, versioned prompts, stored).
- **Memory**: `messages` ledger (append-only), `prospects.notes` (feeds
  drafting), `voice_profiles` (identity), `events` (outcomes).
- **Action**: one scheduled-send primitive (`messages` rows with
  status='scheduled' + the Inngest dispatcher) used by sequences and
  reminders alike. An agent that wants to act simply writes a scheduled row
  or a reminder; every safety check (opt-out, status, cap, quiet hours,
  overrides) runs at send time in one place. New autonomy levels change WHO
  writes the row, never the safety path.
- **Human-in-the-loop channel**: relay sessions. The contractor's SMS thread
  with ReKnock is the approval UI. No app to open, works from a roof.

So each ladder level is mostly prompt + policy work, not infrastructure:
level 2 is one new prompt (suggested-reply) + relay copy + accept tracking;
level 3 is a policy table (tenant x intent -> autonomy) consulted between
classification and relay.

## Guardrails that never move, regardless of level

1. No invented facts: drafts may only reference the quote record, notes, and
   thread. No prices/discounts/material claims not in the record.
2. STOP always wins, at send time, everywhere (already enforced in the one
   send path).
3. Every AI action is ledgered and attributable (model, prompt version,
   confidence, what the human did with it).
4. Misrouting a hot lead to "not interested" stays the unforgivable error:
   ambiguity always escalates to the human, never to silence.
5. The contractor can always see, before anything sends, exactly what will
   send (scheduled bubbles in the thread).

## Sequencing recommendation

1. Now: suggested replies in the relay ping + "text 1 to send" (level 2).
2. Same release: reschedule-intent -> pre-filled reminder proposal.
3. Measure for ~2 months across founding customers; build the accept-rate
   dashboard from `events` SQL (no new vendor).
4. Only then decide on level 3, starting with scheduling-logistics intents,
   behind opt-in + re-registration.
