import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Inngest reads INNGEST_SIGNING_KEY from the environment to verify requests.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
