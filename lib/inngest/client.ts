import { Inngest } from "inngest";

// Event names used across the sequencing engine:
//   prospect/enrolled { company_id, prospect_id, test_mode }
//   prospect/replied  { company_id, prospect_id }
//   prospect/opted_out { company_id, prospect_id }
export const inngest = new Inngest({
  id: "reknock",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
