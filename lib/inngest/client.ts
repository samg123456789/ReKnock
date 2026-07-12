import { Inngest } from "inngest";

// Events used by the scheduled-send engine:
//   message/send.requested  { message_id }   one due scheduled `messages` row
//   reminder/fire.requested { reminder_id }  one due "remind me" ping
// Scheduling and freezing happen directly on `messages` rows (see
// lib/enrollment.ts); there are no enroll/cancel events anymore.
export const inngest = new Inngest({
  id: "reknock",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
