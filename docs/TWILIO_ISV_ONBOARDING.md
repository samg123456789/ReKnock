# ReKnock ISV onboarding contract

ReKnock is an ISV because it sends SMS for contractor customers. Twilio
resources must remain separate: ReKnock's Primary Customer Profile, then each
customer's Secondary Customer Profile, Brand, Campaign, Messaging Service, and
phone number.

## Customer paths

- US/Canada individual or sole proprietor with no EIN: Sole Proprietor Brand.
- Any customer with an EIN or registered entity: Standard or Low-Volume Standard
  Brand. A single-member LLC still follows this path.
- LLC, corporation, or partnership without an EIN: collect the profile, mark it
  `needs_ein`, and do not submit/register the sender yet.

Never collect an SSN. Twilio's Sole Proprietor path uses the customer's name,
address, email, phone, and real mobile number for OTP verification; it does not
require an SSN in ReKnock.

## Fields collected

The identity step collects the exact legal business name, customer-facing
brand/DBA name, entity type, tax-ID decision and encrypted EIN, industry,
address, website/social references, operating region, authorized representative,
verification phone, and brand contact email. Campaign registration will also use
ReKnock's approved quote-follow-up description, consent flow, sample messages,
public Terms/SMS pages, and STOP/HELP behavior.

The customer can edit this information in Settings. Tax IDs are never returned
to the browser; an empty EIN field means “keep the encrypted value already
stored.”

## Automated API sequence

After the ReKnock Primary Customer Profile is approved with Business Identity
`ISV Reseller or Partner`, a background registration job should:

1. Create or reuse the customer's Secondary Customer Profile.
2. Attach customer business information, authorized representative, address,
   and tax identity.
3. Create and submit the A2P Trust Product.
4. Create the customer's Brand Registration.
5. Create a customer-specific Messaging Service.
6. Create the quote-follow-up Campaign with the approved consent flow.
7. Attach the customer's phone number to that service/campaign.
8. Persist every Twilio SID and status, and retry only idempotent/recoverable
   stages.

The migration includes SID and status fields for this sequence. The primary
profile SID is deliberately a production environment variable because it is a
ReKnock account credential, not customer data.

Sole Proprietor registrations support one 10DLC number per campaign. The UI
explains this at number selection without presenting it as a scary compliance
decision.
