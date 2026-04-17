import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { createJobSchema } from "@/lib/jobs";
import { getEntitlements, hasExportCapacity } from "@/lib/quota";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createJobSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Ensure the user row exists (idempotent). Clerk webhook keeps the profile
  // fresh, but we upsert here so first-upload doesn't race the webhook.
  const clerkUser = await currentUser();
  const email = clerkUser?.primaryEmailAddress?.emailAddress ?? `${userId}@clerk.local`;
  await db
    .insert(schema.users)
    .values({
      id: userId,
      email,
      displayName:
        clerkUser?.fullName ??
        clerkUser?.firstName ??
        clerkUser?.username ??
        null,
    })
    .onConflictDoNothing();

  const entitlements = await getEntitlements(userId);
  // Free preview is allowed regardless — checkout gates the full-res download.
  // The job runs either way; the download is paywalled downstream.
  const hasCapacity = hasExportCapacity(entitlements);

  const jobId = randomUUID();
  await db.insert(schema.jobs).values({
    id: jobId,
    userId,
    status: "queued",
    inputKey: parsed.data.inputKey,
    options: parsed.data.options,
    sourceWidth: parsed.data.sourceWidth,
    sourceHeight: parsed.data.sourceHeight,
    // Unpaid jobs still run but produce only the preview-grade output.
    // Paid flow sets paidAt + reexportWindowEndsAt after Stripe completes.
  });

  return NextResponse.json({
    jobId,
    status: "queued",
    entitled: hasCapacity,
  });
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 20));

  const rows = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.userId, userId))
    .orderBy(schema.jobs.createdAt)
    .limit(limit);

  return NextResponse.json({ jobs: rows });
}
