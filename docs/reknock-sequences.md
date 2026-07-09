# ReKnock - Default Follow-Up Sequences v1

Rules baked into every template:
- Each touch under 300 characters (SMS-friendly, no MMS needed)
- Touch 1 always identifies the sender by name + business (kills "who is this?" replies)
- Touch 1 carries the compliance line (reply STOP to opt out) - required in the first message of any thread
- Content stays strictly about the open quote. No specials, no discounts, no promo. Ever. (Keeps us transactional under TCPA and keeps the campaign registration honest.)
- Sequence halts instantly on any reply. Owner is pinged.
- Sends respect quiet hours: 9am–8pm, homeowner's local time.
- Placeholders: {first_name} {owner_name} {business_name} {job_type} {amount} - amount is optional; drop the clause cleanly if missing.

Timing: Day 2 → Day 5 → Day 10 → Day 20 (after quote_sent_at).
Rationale per touch:
- T1 (Day 2): confirm receipt, open the door. Lowest-friction ask.
- T2 (Day 5): add one piece of genuine value/logistics. Not "just checking in."
- T3 (Day 10): surface the decision honestly. Make "no" easy - a fast no beats a slow ghost.
- T4 (Day 20): last call, zero pressure, leaves the door open. Also triggers 'exhausted' state.

---

## ROOFING

**T1 - Day 2**
Hi {first_name}, it's {owner_name} from {business_name}. Wanted to make sure the roof quote landed okay - happy to walk through any of it. Reply STOP to opt out.

**T2 - Day 5**
Hi {first_name}, {owner_name} here. If you're comparing bids, ask every roofer what underlayment they're using and how they handle flashing - it's where cheap quotes cut corners. Happy to explain what's in yours.

**T3 - Day 10**
Hi {first_name}, {owner_name} from {business_name}. Any thoughts on the roof quote? Totally fine if you went another direction - just let me know either way so I can plan the schedule.

**T4 - Day 20**
Hi {first_name}, last note from me on the roof quote - I'll assume the timing isn't right. If it comes back around, the quote's good and you know where to find me. Take care. - {owner_name}

---

## PAINTING

**T1 - Day 2**
Hi {first_name}, it's {owner_name} from {business_name}. Just making sure the painting quote came through alright - any questions, I'm around. Reply STOP to opt out.

**T2 - Day 5**
Hi {first_name}, {owner_name} here. One thing worth asking any painter: what prep is included (sanding, patching, priming). That's usually the difference between quotes. Yours has it itemized - happy to go through it.

**T3 - Day 10**
Hi {first_name}, {owner_name} from {business_name}. Wanted to see where you landed on the {job_type} quote. No pressure either way - a quick yes or no just helps me hold the right spot on the calendar.

**T4 - Day 20**
Hi {first_name}, closing the loop on the paint quote - I'll leave you be after this. If you want to pick it back up down the road, it's all still on file. - {owner_name}, {business_name}

---

## FENCING

**T1 - Day 2**
Hi {first_name}, it's {owner_name} from {business_name}. Wanted to confirm the fence quote reached you - glad to answer anything about materials or timeline. Reply STOP to opt out.

**T2 - Day 5**
Hi {first_name}, {owner_name} here. If you're weighing options: post depth and concrete footing are what make a fence last - worth asking whoever you go with. Happy to walk through how we spec'd yours.

**T3 - Day 10**
Hi {first_name}, {owner_name} from {business_name}. Where'd you land on the fence quote? Even a "not yet" helps - I'm lining up the next few weeks of installs.

**T4 - Day 20**
Hi {first_name}, last one from me on the fence quote. No hard feelings if the timing's off - the quote stays good if you circle back. - {owner_name}

---

## GENERIC (fallback for any trade at onboarding, before voice interview)

**T1 - Day 2**
Hi {first_name}, it's {owner_name} from {business_name}. Making sure the quote for the {job_type} came through okay - questions welcome. Reply STOP to opt out.

**T2 - Day 5**
Hi {first_name}, {owner_name} here. If you're comparing quotes, happy to walk through exactly what's included in ours so you're comparing apples to apples.

**T3 - Day 10**
Hi {first_name}, {owner_name} from {business_name}. Any decision on the {job_type} quote? A quick yes or no either way helps me plan the schedule - no pressure.

**T4 - Day 20**
Hi {first_name}, last note on the {job_type} quote - I'll assume now's not the time. It stays on file if things change. All the best. - {owner_name}

---

## DEFERRED RE-TOUCH (when homeowner said "maybe in spring" - fires on deferred_until)
Hi {first_name}, {owner_name} from {business_name}. You'd mentioned revisiting the {job_type} around now - still interested? Happy to refresh the quote if prices moved. No worries if not.

## VOICE-INTERVIEW CALIBRATION NOTES (for the AI rewrite at onboarding)
- Match the contractor's register: if he says "y'all," the templates say y'all.
- Never add exclamation points beyond one per message. Trades read enthusiasm as sales.
- T3 is the highest-converting touch in this structure because it invites the "no." Do not soften it into "just checking in" - the explicit permission to say no is the mechanism.
- If quote amount > $10k, stretch timing to Day 3 / 7 / 14 / 30 (bigger decisions move slower).

## CONCIERGE MODE (manual phase)
Use these verbatim from a Google Voice number. Log every send + reply in the tracking sheet with timestamp. You are testing: reply rate per touch, which touch triggers replies, and whether contractors feed you quotes without prompting.
