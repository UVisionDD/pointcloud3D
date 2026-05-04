import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { db, schema } from "@/lib/db";
import { serverEnv } from "@/lib/env";

const bodySchema = z.object({
  code: z.string().min(1).max(64),
  jobId: z.string().min(1).optional(),
});

function validCodes(): Set<string> {
  const raw = serverEnv().DISCOUNT_CODES ?? "";
  return new Set(
    raw
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const codeNorm = parsed.data.code.trim().toLowerCase();
  const codes = validCodes();
  if (codes.size === 0 || !codes.has(codeNorm)) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  // Make sure the user row exists so the FK on creditLedger / users updates resolves.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress;
  if (!email) {
    return NextResponse.json({ error: "no_email" }, { status: 400 });
  }
  await db
    .insert(schema.users)
    .values({ id: userId, email })
    .onConflictDoNothing();

  // Per-job redemption: unlock that specific job + 30-day re-export window.
  if (parsed.data.jobId) {
    const [job] = await db
      .select()
      .from(schema.jobs)
      .where(
        and(
          eq(schema.jobs.id, parsed.data.jobId),
          eq(schema.jobs.userId, userId),
        ),
      )
      .limit(1);
    if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (job.paidAt) {
      return NextResponse.json({ ok: true, alreadyPaid: true });
    }

    const paidAt = new Date();
    const windowEnd = new Date(paidAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    await db
      .update(schema.jobs)
      .set({ paidAt, reexportWindowEndsAt: windowEnd, updatedAt: paidAt })
      .where(eq(schema.jobs.id, job.id));

    await db
      .insert(schema.creditLedger)
      .values({
        id: randomUUID(),
        userId,
        delta: 0,
        reason: `discount_code:${codeNorm}:job`,
        jobId: job.id,
      })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  }

  // User-level redemption (from /pricing): grant PAYG credits.
  // Each (user, code) pair can only redeem once.
  const reason = `discount_code:${codeNorm}`;
  const [existing] = await db
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.reason, reason),
      ),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json({ ok: true, alreadyRedeemed: true });
  }

  const credits = serverEnv().DISCOUNT_CODE_CREDITS ?? 99;

  await db.insert(schema.creditLedger).values({
    id: randomUUID(),
    userId,
    delta: credits,
    reason,
  });
  await db
    .update(schema.users)
    .set({
      paygCredits: sql`${schema.users.paygCredits} + ${credits}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  return NextResponse.json({ ok: true, creditsGranted: credits });
}
