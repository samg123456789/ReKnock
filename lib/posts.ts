/* Blog posts as structured data - no CMS needed at this scale.
   Each post targets a question contractors actually search/ask AI,
   written to be quotable by answer engines (AEO): direct answer first,
   then depth. Add posts here; slug pages render automatically. */

export type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  readMinutes: number;
  // simple content model: array of blocks
  blocks: Array<
    | { type: "p"; text: string }
    | { type: "h2"; text: string }
    | { type: "quote"; text: string }
    | { type: "list"; items: string[] }
  >;
};

export const posts: Post[] = [
  {
    slug: "how-many-times-follow-up-estimate",
    title: "How many times should a contractor follow up on an estimate?",
    description:
      "The short answer: 3 to 4 times over three weeks. Here's the timing that wins jobs without annoying homeowners, and why most contractors stop one touch too early.",
    date: "2026-07-08",
    readMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "Short answer: follow up 3 to 4 times over about three weeks - day 2, day 5, day 10, and a final note around day 20. Most jobs that come back arrive on the second or third touch, which is exactly where most contractors have already given up.",
      },
      { type: "h2", text: "Why one follow-up isn't enough" },
      {
        type: "p",
        text: "Homeowners aren't ignoring you to be rude. They're comparing three bids, coordinating with a spouse, and living their lives. Your quote isn't rejected - it's buried. A single 'just checking in' two days later doesn't survive that. A polite rhythm over three weeks does, because it keeps you on top of the pile every time the decision resurfaces at their kitchen table.",
      },
      { type: "h2", text: "The timing that works" },
      {
        type: "list",
        items: [
          "Day 2 - confirm the quote arrived and open the door for questions. Lowest-friction touch, highest reply rate.",
          "Day 5 - add one useful thing: a detail about materials, what's included, how to compare bids. Never a bare 'checking in.'",
          "Day 10 - ask for the decision directly, and make 'no' easy. A fast no beats a slow ghost: it frees your schedule and often earns a referral.",
          "Day 20 - one last, zero-pressure note. Leave the door open; kitchen remodels come back in spring.",
        ],
      },
      { type: "h2", text: "Text beats email for the trades" },
      {
        type: "p",
        text: "Homeowners answer texts and ignore inboxes. A short SMS from the contractor's own number gets read within minutes; the same words in an email get opened next Tuesday, maybe. Keep each message under 300 characters, sign it with your name, and always give people a way to opt out.",
      },
      {
        type: "quote",
        text: "The sale statistically happens on touch 3 to 5. Most contractors send zero or one.",
      },
      {
        type: "p",
        text: "If remembering to do this at 7pm after a full day on a roof sounds unrealistic - that's the entire reason ReKnock exists. It runs this exact rhythm automatically, in your voice, and stops the instant the homeowner replies.",
      },
    ],
  },
  {
    slug: "follow-up-text-templates-for-contractors",
    title: "Free follow-up text templates for contractors (copy & paste)",
    description:
      "The full 4-touch follow-up sequence in three tones - friendly, professional, straight-shooter - plus trade-specific messages for 10 trades. Free to copy and send.",
    date: "2026-07-08",
    readMinutes: 7,
    blocks: [
      {
        type: "p",
        text: "These are the exact follow-up messages we run for contractors - free to copy. Below you'll find the full 4-touch sequence in three tones (pick the one that sounds like you), plus trade-specific messages for ten different trades. Send them manually, or let ReKnock run them automatically in your chosen tone and stop the instant the homeowner replies.",
      },
      { type: "h2", text: "First, pick your tone" },
      {
        type: "p",
        text: "The words matter less than the voice. A follow-up that doesn't sound like you reads as spam. Every ReKnock sequence comes in three tones - here's the same day-2 check-in written each way so you can hear the difference:",
      },
      {
        type: "list",
        items: [
          "FRIENDLY - \"Hi Sarah! Mike from Ridgeline Roofing here. Just making sure the quote made it to you okay - happy to talk through any of it whenever works.\"",
          "PROFESSIONAL - \"Hello Sarah, this is Mike Torres with Ridgeline Roofing. I wanted to confirm you received the estimate we prepared. Please let me know if you have any questions.\"",
          "STRAIGHT-SHOOTER - \"Sarah - Mike, Ridgeline Roofing. Quote land okay? Questions, just text back.\"",
        ],
      },
      { type: "h2", text: "The full 4-touch sequence (friendly tone)" },
      {
        type: "quote",
        text: "Day 2: Hi Sarah! Mike from Ridgeline Roofing. Just making sure the quote landed okay - happy to walk through any of it.",
      },
      {
        type: "quote",
        text: "Day 5: Hi Sarah, Mike again. If you're comparing bids, here's a tip regardless of who you pick: [one useful trade-specific detail - see below]. Happy to explain what's in yours.",
      },
      {
        type: "quote",
        text: "Day 10: Hi Sarah, any thoughts on the quote? Totally fine if you went another direction - just let me know either way so I can plan the schedule.",
      },
      {
        type: "quote",
        text: "Day 20: Hi Sarah, last note from me - I'll assume the timing isn't right. The quote stays good if things change. Take care! - Mike",
      },
      { type: "h2", text: "The same sequence, straight-shooter tone" },
      {
        type: "quote",
        text: "Day 2: Sarah - Mike, Ridgeline Roofing. Quote land okay? Questions, text back.",
      },
      {
        type: "quote",
        text: "Day 5: Sarah - comparing bids? Ask every roofer what underlayment they use. Cheap quotes cut corners there. Mine's in writing.",
      },
      {
        type: "quote",
        text: "Day 10: Sarah - yes or no on the roof? Either answer helps. No hard feelings, just planning the schedule.",
      },
      {
        type: "quote",
        text: "Day 20: Last one from me. Quote's good if you circle back. - Mike",
      },
      { type: "h2", text: "The day-5 message, by trade" },
      {
        type: "p",
        text: "Touch 2 is where trade knowledge earns trust: give the homeowner one genuinely useful thing for comparing bids - never a bare 'just checking in.' Steal the right one:",
      },
      {
        type: "list",
        items: [
          "ROOFING - \"Ask every roofer what underlayment they're using and how they handle flashing - it's where cheap quotes cut corners.\"",
          "PAINTING - \"Ask what prep is included: sanding, patching, priming. That's usually the real difference between quotes.\"",
          "FENCING - \"Post depth and concrete footing are what make a fence last - worth asking whoever you go with.\"",
          "DECKS - \"Ask how the ledger board gets flashed and what the joist spacing is. That's the difference between 10 years and 30.\"",
          "CONCRETE - \"Ask about base prep and whether control joints are included - cracks come from what's under the slab, not the slab.\"",
          "TREE WORK - \"Make sure any bid includes cleanup and haul-away, and ask for proof of insurance - tree work without it is a homeowner's liability.\"",
          "GARAGE DOORS - \"Ask whether the springs are rated for 10,000 or 20,000 cycles - it's a small line item that doubles the life of the door.\"",
          "LANDSCAPING - \"Ask what soil prep is included. Plants fail from the ground down, and it's the first thing cheap bids skip.\"",
          "HVAC - \"Ask for a load calculation, not a rule-of-thumb sizing. An oversized unit costs you every month for 15 years.\"",
          "GUTTERS & PRESSURE WASHING - \"Ask about downspout placement and where the water actually goes - moving water off the roof is easy, moving it away from the foundation is the job.\"",
        ],
      },
      { type: "h2", text: "The rules that keep you out of trouble" },
      {
        type: "list",
        items: [
          "Only text people who gave you their number for the estimate, and keep messages about that estimate.",
          "Include opt-out language the first time you text a new number (\"Reply STOP to opt out\").",
          "Stop immediately when someone replies - nothing kills trust like an automated nudge landing after a real answer.",
          "No texts before 9am or after 8pm, their local time.",
        ],
      },
      {
        type: "p",
        text: "Want the professional-tone set, or a trade we didn't cover? Every ReKnock account gets all three tones customized to your business during a 10-minute setup - that's the whole point.",
      },
    ],
  },
  {
    slug: "why-homeowners-ghost-contractor-quotes",
    title: "Why homeowners ghost contractor quotes (it's not the price)",
    description:
      "You quoted it, they vanished. Here's what's actually happening on the homeowner's side - and the follow-up habit that recovers those jobs.",
    date: "2026-07-08",
    readMinutes: 4,
    blocks: [
      {
        type: "p",
        text: "Short answer: homeowners ghost because deciding is uncomfortable and life is busy - not because your price was wrong. They collected three bids, got overwhelmed, and the whole project slid to next month. The contractor who politely resurfaces is usually the one who gets the job when it slides back.",
      },
      { type: "h2", text: "What the silence actually means" },
      {
        type: "list",
        items: [
          "They're waiting on another bid that's late.",
          "One spouse is sold, the other isn't yet.",
          "The money conversation got postponed.",
          "They feel awkward saying no, so they say nothing.",
          "They simply forgot - your quote is under 40 unread emails.",
        ],
      },
      {
        type: "p",
        text: "Notice that none of these mean 'lost.' Every one of them is a job that can still land - but only for the contractor who's present when the decision finally happens.",
      },
      { type: "h2", text: "Why contractors don't follow up" },
      {
        type: "p",
        text: "It's not laziness. After ten hours on site, chasing feels like begging, and nobody wants to be the pushy one. So the industry default is one follow-up or none - which means a consistent, polite rhythm is one of the cheapest competitive edges available in the trades. Your competitors aren't beating you on price. They're beating you on being the last text in the thread.",
      },
      {
        type: "quote",
        text: "The job doesn't always go to the lowest bid. It very often goes to the last contractor who followed up.",
      },
      { type: "h2", text: "The fix is a rhythm, not a personality change" },
      {
        type: "p",
        text: "Four short texts over three weeks - day 2, 5, 10, 20 - sent in your normal voice, ending with a message that makes 'no' easy to say. You can run it from your phone with our free templates, or have ReKnock run it automatically and hand you the conversation the second someone replies.",
      },
    ],
  },
];

export function getPost(slug: string) {
  return posts.find((p) => p.slug === slug);
}
