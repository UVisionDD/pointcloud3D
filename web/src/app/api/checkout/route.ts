import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { publicEnv, serverEnv } from "@/lib/env";
import { stripe } from "@/lib/stripe";

const bodySchema = z.object({
  priceId: z.string().min(1),
  mode: z.enum(["payment", "subscription"]),
  jobId: z.string().optional(), // so we can unlock this specific job after payment
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) {
    return NextResponse.json({ error: "no_email" }, { status: 400 });
  }

  // Find or create a Stripe customer.
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  let customerId = existing?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email,
      metadata: { clerkUserId: userId },
    });
    customerId = customer.id;
    await db
      .insert(schema.users)
      .values({ id: userId, email, stripeCustomerId: customerId })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { stripeCustomerId: customerId, email },
      });
  }

  const session = await stripe().checkout.sessions.create({
    mode: parsed.data.mode,
    customer: customerId,
    line_items: [{ price: parsed.data.priceId, quantity: 1 }],
    success_url: `${publicEnv.NEXT_PUBLIC_APP_URL}/dashboard?checkout=success${
      parsed.data.jobId ? `&jobId=${parsed.data.jobId}` : ""
    }`,
    cancel_url: `${publicEnv.NEXT_PUBLIC_APP_URL}/pricing?checkout=cancelled`,
    allow_promotion_codes: true,
    metadata: {
      clerkUserId: userId,
      jobId: parsed.data.jobId ?? "",
    },
    subscription_data:
      parsed.data.mode === "subscription"
        ? { metadata: { clerkUserId: userId } }
        : undefined,
  });
  // serverEnv() is called implicitly in stripe(); this line exists to make the
  // `serverEnv` import load-check run on this route in prod builds.
  void serverEnv();

  return NextResponse.json({ url: session.url });
}
