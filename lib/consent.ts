// Contractor consent attestation shown at the point of capture (the single
// quote confirm screen and the CSV bulk import). Kept as a versioned constant
// so the exact wording the contractor agreed to is recorded on the prospect's
// event ledger and can be reproduced later for a dispute or A2P audit.
//
// >>> LEGAL REVIEW PENDING <<< the wording here is a draft for the same review
// as /sms-terms. It is a contractor-side attestation (not homeowner-facing
// copy), so it is safe to ship on dev; do not treat it as final consent
// language until Sam's legal review signs off before the A2P resubmit.

export const CONSENT_ATTESTATION_VERSION = 1;

// Linked reference points at /sms-terms - the "Text message program & consent"
// page that lays out the opt-in call-to-action, message frequency, msg & data
// rates, STOP/HELP, and links onward to Privacy + Terms. It is the single most
// on-point page for a consent attestation. Rendered small + de-emphasized (a
// secondary reference, not a call-to-action) next to the checkbox label.
export const CONSENT_LINK_HREF = "/sms-terms";
export const CONSENT_LINK_LABEL = "SMS terms";

export const CONSENT_ATTESTATION_SINGLE =
  "I confirm this customer agreed to receive text messages about their quote.";
export const CONSENT_ATTESTATION_BULK =
  "I confirm these customers agreed to receive text messages about their quotes.";
