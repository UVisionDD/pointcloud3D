import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { createJobSchema } from "@/lib/jobs";
import { getEntitlements, hasExportCapacity } from "@/lib/quota";

const GUEST_USER_ID = "guest";
const GUEST_USER_EMAIL = "guest@pointcloud3d.local";

function errorDetail(e: unknown): string {
  if (e instanceof Error) {
    // Postgres errors from the `postgres` driver carry useful fields on top of
    // the message (code, detail, column). Include them so the client sees
    // something actionable instead of a generic 500.
    const pg = e as Error & { code?: string; detail?: string; column?: string; constraint?: string };
    const bits = [e.message];
    if (pg.code) bits.push(`code=${pg.code}`);
    if (pg.detail) bits.push(`detail=${pg.detail}`);
    if (pg.column) bits.push(`column=${pg.column}`);
    if (pg.constraint) bits.push(`constraint=${pg.constraint}`);
    return bits.join(" | ");
  }
  return String(e);
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();

    const json = await req.json().catch(() => null);
    const parsed = createJobSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    // Ensure the user row exists (idempotent). For signed-in users the Clerk
    // webhook keeps the profile fresh, but we upsert here so first-upload
    // doesn't race the webhook. For guests we fall back to a shared row so the
    // jobs.user_id FK is satisfied.
    let effectiveUserId: string;
    if (userId) {
      const clerkUser = await currentUser();
      const email = clerkUser?.primaryEmailAddress?.emailAddress ?? `${userId}@clerk.local`;
      try {
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
      } catch (e) {
        // A duplicate-email on a different id can hit the unique index.
        // Non-fatal if the row for this userId already exists; we fall
        // through and try the jobs insert, which will FK-fail if the user
        // really isn't there.
        console.error("[api/jobs] users upsert failed (continuing)", errorDetail(e));
      }
      effectiveUserId = userId;
    } else {
      try {
        await db
          .insert(schema.users)
          .values({ id: GUEST_USER_ID, email: GUEST_USER_EMAIL, displayName: "Guest" })
          .onConflictDoNothing();
      } catch (e) {
        console.error("[api/jobs] guest upsert failed (continuing)", errorDetail(e));
      }
      effectiveUserId = GUEST_USER_ID;
    }

    // Guests always run in preview mode (entitled=false); the paid download
    // path gates on a real account + Stripe downstream.
    let hasCapacity = false;
    if (userId) {
      try {
        const entitlements = await getEntitlements(userId);
        hasCapacity = hasExportCapacity(entitlements);
      } catch (e) {
        console.error("[api/jobs] getEntitlements failed (continuing)", errorDetail(e));
      }
    }

    const jobId = randomUUID();
    try {
      await db.insert(schema.jobs).values({
        id: jobId,
        userId: effectiveUserId,
        status: "queued",
        inputKey: parsed.data.inputKey,
        options: parsed.data.options,
        sourceWidth: parsed.data.sourceWidth,
        sourceHeight: parsed.data.sourceHeight,
        // Unpaid jobs still run but produce only the preview-grade output.
        // Paid flow sets paidAt + reexportWindowEndsAt after Stripe completes.
      });
    } catch (e) {
      const detail = errorDetail(e);
      console.error("[api/jobs] jobs insert failed", detail);
      return NextResponse.json(
        { error: `jobs insert failed: ${detail}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      jobId,
      status: "queued",
      entitled: hasCapacity,
    });
  } catch (e) {
    const detail = errorDetail(e);
    console.error("[api/jobs] POST failed", detail);
    return NextResponse.json(
      { error: `jobs POST failed: ${detail}` },
      { status: 500 },
    );
  }
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
