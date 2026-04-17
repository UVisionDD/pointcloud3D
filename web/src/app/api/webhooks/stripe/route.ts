import { NextResponse } from "next/server";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, schema } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { paygCreditsForPrice, planForPrice, stripe } from "@/lib/stripe";

/**
 * Stripe webhook. Configure a webhook endpoint in the Stripe dashboard
 * pointing at https://<your-app>/api/webhooks/stripe and set the signing
 * secret as STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing_sig" }, { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  try {
    const secret = serverEnv().STRIPE_WEBHOOK_SECRET;
    if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 500 });
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `bad_signature: ${e}` }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const userId = s.metadata?.clerkUserId;
      if (!userId) break;

      if (s.mode === "payment") {
        // PAYG — grant credits, unlock the referenced job if any.
        const lineItems = await stripe().checkout.sessions.listLineItems(s.id, {
          expand: ["data.price"],
        });
        let totalCredits = 0;
        for (const li of lineItems.data) {
          const priceId = li.price?.id;
          if (priceId) totalCredits += paygCreditsForPrice(priceId) * (li.quantity ?? 1);
        }
        if (totalCredits > 0) {
          await db
            .insert(schema.creditLedger)
            .values({
              id: randomUUID(),
              userId,
              delta: totalCredits,
              reason: "payg_purchase",
              stripeEventId: event.id,
            })
            .onConflictDoNothing();
          await db
            .update(schema.users)
            .set({
              paygCredits: sql`${schema.users.paygCredits} + ${totalCredits}`,
              updatedAt: new Date(),
            })
            .where(eq(schema.users.id, userId));
        }
        const jobId = s.metadata?.jobId;
        if (jobId) {
          const paidAt = new Date();
          const windowEnd = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);
          await db
            .update(schema.jobs)
            .set({ paidAt, reexportWindowEndsAt: windowEnd })
            .where(eq(schema.jobs.id, jobId));
        }
      }

      // Subscription sessions: the subscription row comes via its own events.
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const item = sub.items.data[0];
      const priceId = item?.price.id;
      const meta = sub.metadata ?? {};
      const userId = meta.clerkUserId;
      const plan = priceId ? planForPrice(priceId) : null;
      if (!userId || !priceId || !plan || plan.plan === "payg" || !item) break;

      // Stripe moved period dates onto subscription items in recent API
      // versions; the subscription-level fields are no longer in the TS types.
      const periodStart = new Date(item.current_period_start * 1000);
      const periodEnd = new Date(item.current_period_end * 1000);

      await db
        .insert(schema.subscriptions)
        .values({
          id: sub.id,
          userId,
          stripePriceId: priceId,
          plan: plan.plan,
          status: sub.status,
          monthlyExports: plan.monthlyExports,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        })
        .onConflictDoUpdate({
          target: schema.subscriptions.id,
          set: {
            status: sub.status,
            stripePriceId: priceId,
            plan: plan.plan,
            monthlyExports: plan.monthlyExports,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            updatedAt: new Date(),
          },
        });
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await db
        .update(schema.subscriptions)
        .set({ status: "canceled", updatedAt: new Date() })
        .where(eq(schema.subscriptions.id, sub.id));
      break;
    }

    case "invoice.paid": {
      const inv = event.data.object;
      const subId = inv.parent?.subscription_details?.subscription;
      if (typeof subId === "string") {
        // Reset monthly usage counter on each paid invoice.
        await db
          .update(schema.subscriptions)
          .set({ exportsUsedThisPeriod: 0, updatedAt: new Date() })
          .where(eq(schema.subscriptions.id, subId));
      }
      break;
    }

    default:
      // ignore
      break;
  }

  return NextResponse.json({ received: true });
}
