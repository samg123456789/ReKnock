// Contractor consent attestation shown at the point of capture (the single
// quote confirm screen and the CSV bulk import). Kept as a versioned constant
// so the exact wording the contractor agreed to is recorded on the prospect's
// event ledger and can be reproduced later for a dispute or A2P audit.
//
// Current A2P resubmission wording: explicit prior quote request, mobile
// number consent, and no cold outreach / purchased-list use.

export const CONSENT_ATTESTATION_VERSION = 3;

// Linked reference points at /sms-terms - the "Text message program & consent"
// page that lays out the opt-in call-to-action, message frequency, msg & data
// rates, STOP/HELP, and links onward to Privacy + Terms. It is the single most
// on-point page for a consent attestation. Rendered small + de-emphasized (a
// secondary reference, not a call-to-action) next to the checkbox label.
export const CONSENT_LINK_HREF = "/sms-terms";
export const CONSENT_LINK_LABEL = "SMS terms";

export const CONSENT_ATTESTATION_SINGLE =
  "I confirm this contact requested a quote from my business and agreed to receive quote-related text messages.";
export const CONSENT_ATTESTATION_BULK =
  "I confirm each contact in this import requested a quote from my business and agreed to receive quote-related text messages.";
