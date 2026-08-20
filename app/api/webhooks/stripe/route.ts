import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, mapSubStatus } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { inngest } from "@/lib/inngest/client";

// Stripe webhook. Invariant 6: verify signature, persist raw, ack fast. We
// mirror subscription status onto companies (Stripe is the source of truth).
// TODO: move the mirror work to Inngest once background jobs land (Phase 5).
export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, env.stripeWebhookSecret());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const admin = createAdminClient();

  // Persist the raw event first (append-only audit trail).
  await admin.from("events").insert({
    type: `stripe.${event.type}`,
    payload: event as unknown as Record<string, unknown>,
  });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.client_reference_id;
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        let status: string | null = "trialing";
        if (subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          status = mapSubStatus(sub.status);
        }

        if (companyId) {
          await admin
            .from("companies")
            .update({
              stripe_customer_id: customerId ?? null,
              stripe_subscription_id: subId ?? null,
              subscription_status: status,
              plan: (session.metadata?.plan as string) ?? null,
            })
            .eq("id", companyId);
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const status =
          event.type === "customer.subscription.deleted"
            ? "canceled"
            : mapSubStatus(sub.status);
        await admin
          .from("companies")
          .update({ subscription_status: status, stripe_subscription_id: sub.id })
          .eq("stripe_customer_id", customerId);

        // Canceled = stop paying Twilio for their number. Enqueue only (ack
        // fast); the release-company-numbers Inngest function does the work.
        if (status === "canceled") {
          const { data: canceledCo } = await admin
            .from("companies")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .maybeSingle();
          if (canceledCo) {
            await inngest.send({
              name: "company/numbers.release",
              data: { company_id: canceledCo.id, reason: "subscription_canceled" },
            });
          }
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId =
          typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        if (customerId) {
          await admin
            .from("companies")
            .update({ subscription_status: "past_due" })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
    }
  } catch (err) {
    // Log and still ack: Stripe retries on non-2xx, and the raw event is stored.
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from("failed_jobs").insert({
      job_type: "stripe_webhook",
      payload: { event_id: event.id, type: event.type },
      error: msg,
    });
  }

  return NextResponse.json({ received: true });
}
