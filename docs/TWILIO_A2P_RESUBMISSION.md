# Twilio A2P 10DLC resubmission

Status: draft for the next Twilio resubmission after the updated public pages
are deployed to `https://getreknock.com`.

## Why the prior submissions failed

- `30886`: campaign description did not clearly explain who sends messages,
  who receives them, and why.
- `30909`: message flow / call-to-action could not be verified. The rejected
  submission listed both verbal consent and a contractor web-form path, but did
  not provide public proof for those opt-in methods.

## Resubmission strategy

Do not resubmit the old verbal-only flow. The product's first-message disclosure
is hardcoded and shown below, but that disclosure is not the opt-in itself. A
contact must already have permission to receive quote-related SMS before the
contractor enrolls them. If the contractor's website is the consent source, the
exact public URL and an unchecked SMS consent checkbox must be supplied in the
submission. Do not claim a web-form path until that form is live and reviewable.

Use the **Sole Proprietor** campaign use case for this submission. "Starter"
is the Twilio profile type used during registration, not the campaign use case.
Before submitting, confirm that the Messaging Service has the exact Twilio
10DLC sender number attached to this campaign. Use that exact number in any
Twilio field that asks which number originates the messages.

Use `https://getreknock.com/sms-terms` as the public proof URL in the message
flow field. It explains how contractors use ReKnock for existing quote
inquiries, shows the required enrollment guardrail, documents the hardcoded
first-message disclosure, and includes three reviewable message exchanges plus
STOP/HELP, Privacy, and Terms.

The public page also includes reviewable mockups for:

- Unchecked consent attestation:
  `https://getreknock.com/compliance/consent-checkbox-mockup.svg`
- First-message and STOP exchange examples:
  `https://getreknock.com/compliance/sms-exchange-1.svg`
  `https://getreknock.com/compliance/sms-exchange-2.svg`
  `https://getreknock.com/compliance/sms-exchange-3.svg`
- Privacy and mobile-data handling:
  `https://getreknock.com/compliance/privacy-data-mockup.svg`

## Campaign description

ReKnock is a quote follow-up texting service for residential contractors such as
roofers, painters, landscapers, fence companies, and similar trades. ReKnock
sends limited SMS follow-up messages for homeowners who requested a quote from a
contractor, gave that contractor their mobile number, and agreed to receive text
follow-ups about that specific quote. Each first message identifies the
contractor, the contractor's business, and ReKnock. Recipients are homeowners
with an open requested quote or estimate. Messages ask whether the homeowner has
questions, wants to move forward, or asked to be contacted later. This is not
cold outreach, purchased-list messaging, third-party lead generation, or
unrelated marketing. A typical sequence is 1 to 4 messages over about 20 days.
Automated follow-ups stop when the homeowner replies or texts STOP.

## How do end-users consent to receive messages?

The contractor enrolls an inquiry only after the homeowner has provided a mobile
number and agreed to receive quote-related text follow-up through the contractor's
lead flow. ReKnock records a required contractor attestation before scheduling
messages. The first outbound message then includes this hardcoded disclosure on
separate lines after the contractor's message: "Message and data rates may
apply. Reply STOP to opt out." The disclosure does not create consent and cannot
be used to text a person who did not already agree to receive messages.

Public proof of the first-message behavior, message examples, STOP handling, and
the enrollment guardrail is at https://getreknock.com/sms-terms. Privacy Policy:
https://getreknock.com/privacy. Terms and Conditions:
https://getreknock.com/terms.

Do not claim web-form opt-in until a live, reviewable contractor form with an
unchecked SMS consent checkbox and exact public URL exists. Contractors may not
upload purchased lists, scraped numbers, cold leads, third-party lead lists,
trade show lists, or anyone who did not directly request a quote from that
contractor and consent to quote-related text follow-up.

## Sample messages

Sample message 1:

Hi [Sarah], it's [Mike] with [Apex Roofing] through ReKnock, following up on the [roof] quote we discussed. Any questions I can answer?

Message and data rates may apply.
Reply STOP to opt out.

Sample message 2:

Hi [Sarah], it's [Mike] with [Apex Roofing] through ReKnock. Just checking in on that [roofing] estimate. Happy to walk it through whenever works for you. Reply STOP to opt out.

Sample message 3:

Hi [Sarah], it's [Mike] with [Apex Roofing] through ReKnock. You asked me to circle back this month about the [roof] estimate. Still a good time to talk it through? Reply STOP to opt out.

Sample message 4:

Hi [Sarah], it's [Mike] with [Apex Roofing] through ReKnock. Wanted to close the loop on that [roof] estimate. If now is not the right time, I can check back later. Reply STOP to opt out.

## Content attributes

- Embedded links: No
- Embedded phone numbers: Yes, if a contractor manually includes a callback
  number in a reply
- Direct lending or loan arrangement: No
- Age-gated content: No

## Keywords

Opt-in keywords: leave blank unless an actual SMS keyword opt-in flow is
implemented. The product does not use an SMS keyword to create consent.

Opt-out keywords:

OPTOUT,CANCEL,END,QUIT,UNSUBSCRIBE,REVOKE,STOP,STOPALL

Opt-out message:

You have successfully been unsubscribed. You will not receive any more messages
from this number. Reply START to resubscribe.

Help keywords:

HELP,INFO

Help message:

ReKnock quote follow-ups on behalf of your contractor. Reply STOP to
unsubscribe. Message and data rates may apply.

## URLs

- Website: https://getreknock.com/
- Opt-in proof / SMS terms: https://getreknock.com/sms-terms
- Privacy Policy: https://getreknock.com/privacy
- Terms and Conditions: https://getreknock.com/terms
