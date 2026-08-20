// Onboarding drip: five founder-voiced emails after a contractor finishes
// onboarding. Sent by the Inngest fn `onboarding-drip` (lib/inngest/functions).
// From Sam personally, not a no-reply: replies to sam@ route back to the
// founder's inbox via the inbound catch-all. Plain text, contractor English,
// numbered subjects so the series reads as intentional.

export const DRIP_FROM = "Sam from ReKnock <sam@getreknock.com>";

export type DripEmail = {
  // Days after onboarding completes. The first goes out an hour in (feels
  // like a person noticed you signed up, not an autoresponder firing).
  delayHours: number;
  subject: string;
  body: (v: { firstName: string; intakeEmail: string }) => string;
};

export const ONBOARDING_DRIP: DripEmail[] = [
  {
    delayHours: 1,
    subject: "1/5: Your first quote is the whole game",
    body: ({ firstName, intakeEmail }) => `Hey${firstName ? ` ${firstName}` : ""},

Sam here, the guy behind ReKnock. Thanks for setting things up.

One thing matters right now: get one real quote in. Everything else in ReKnock is just waiting for that.

Three ways, pick the easiest:
1. Forward the quote email to ${intakeEmail} (send it from the email you signed up with)
2. Snap a photo of the estimate in the app and we pull out the details
3. Type it in, takes about 15 seconds

The moment it is in, you will see the exact follow-up texts we will send and when. Nothing goes out without you seeing the plan first.

Reply to this email if anything is confusing. I read every one.

Sam`,
  },
  {
    delayHours: 48,
    subject: "2/5: Make the texts sound exactly like you",
    body: ({ firstName }) => `Hey${firstName ? ` ${firstName}` : ""},

Quick one. The follow-ups we send are drafted in your voice, from the samples you gave us during setup. Two ways to tighten that up:

1. Open any quote in your inbox and tap a scheduled follow-up. You can read the exact text before it sends, rewrite it word for word, move it to a different day, or delete it. Whatever you type sends exactly as you typed it.

2. The Follow-ups tab is the template every new quote starts from. Change the timing (day 2, 5, 10, 20 out of the box) or the wording once, and every new quote inherits it.

Most guys never touch either and that is fine. But if a text ever does not sound like you, that is where you fix it, once, forever.

If you want to see what good follow-up texts look like, we wrote up the exact templates that work: https://getreknock.com/blog/follow-up-text-templates-for-contractors

Sam`,
  },
  {
    delayHours: 120,
    subject: "3/5: When a homeowner replies, here's the play",
    body: ({ firstName }) => `Hey${firstName ? ` ${firstName}` : ""},

This is the part that wins jobs, so here is exactly what happens when a homeowner texts back:

1. All remaining follow-ups stop instantly. We never talk over a live conversation.
2. You get a clean email with what they said, and the conversation is waiting in your ReKnock inbox.
3. Reply to the email and ReKnock sends your words back as a text from your ReKnock number. Or open the inbox thread and answer there.
4. If they say "not until spring" or "call me next month", set a circle-back from the inbox. It goes out on the right day, in your voice, without you remembering anything.

The whole point: you find out the second a lead warms up, and answering fits the email/app workflow you already use.

Sam`,
  },
  {
    delayHours: 192,
    subject: "4/5: Small habits that get more replies",
    body: ({ firstName }) => `Hey${firstName ? ` ${firstName}` : ""},

Four things the contractors getting the most replies all do:

1. When you give a quote, ask "what is the best number to text you on?" Say it every time. A quote with a real mobile number is a quote we can chase.
2. Get the quote into ReKnock the same day you give it. The day-2 follow-up only works if day 2 is actually day 2.
3. Keep your own texts short when you jump into a conversation. You are a contractor texting from a truck, not a call center. That is exactly why this works.
4. Do not mark a quote lost too early. "No answer" is not "no". The day-20 message wins jobs precisely because everyone else gave up by then.

That is it. No dashboards to study.

Two short reads if you want the why behind it:
Why homeowners ghost quotes (it is almost never the price): https://getreknock.com/blog/why-homeowners-ghost-contractor-quotes
How many follow-ups is too many: https://getreknock.com/blog/how-many-times-follow-up-estimate

Sam`,
  },
  {
    delayHours: 288,
    subject: "5/5: Make it automatic",
    body: ({ firstName, intakeEmail }) => `Hey${firstName ? ` ${firstName}` : ""},

Last one from me, then I will get out of your inbox.

The contractors who get the most out of ReKnock do exactly one thing differently: every quote goes in, the minute it goes out. Not the promising ones. All of them. The math only works when the boring quotes are in too, because you cannot predict which homeowner ghosts.

Two shortcuts:
1. Forwarding the quote email takes less time than deciding whether to bother.
2. Got a backlog? There is a CSV import in the app (Add a quote, then "Importing a bunch?"). Export your old quotes from wherever they live and chase all of them tonight.

One saved job pays for years of this. That is the whole pitch.

If anything has felt rough or confusing in your first two weeks, reply and tell me. I am one guy building this for people like you, and the blunt emails are the useful ones.

Sam`,
  },
];
