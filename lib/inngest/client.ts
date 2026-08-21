import { Inngest } from "inngest";

// Events used by the scheduled-send engine:
//   message/send.requested   { message_id }   one due scheduled `messages` row
//   reminder/fire.requested  { reminder_id }  one due "remind me" ping
//   company/numbers.release  { company_id, reason }  release Twilio numbers
//   admin/reconcile.requested {}              run number reconciliation now
//   product/github.push      { agent_event_id } summarize a GitHub push
// Scheduling and freezing happen directly on `messages` rows (see
// lib/enrollment.ts); there are no enroll/cancel events anymore.
export const inngest = new Inngest({
  id: "reknock",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
