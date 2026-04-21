import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db, schema } from "@/lib/db";
import { jobOptionsSchema } from "@/lib/jobs";

// Force dynamic — this creates rows, never cache.
export const dynamic = "force-dynamic";

const GUEST_USER_ID = "guest";

/**
 * Spawn a fast-path retune job.
 *
 * The parent job must be `done` and have a cached depth map (worker uploaded
 * depth.npy + image_rgb.npy to R2 when it finished). The new child job reuses
 * that cache, so the worker skips bg removal, depth inference, and face-aware
 * enhancement — turnaround drops from ~5s to ~500ms, making slider-driven
 * live previews feel interactive.
 *
 * The client sends a partial options patch; we merge it on top of the parent's
 * options so the caller doesn't have to know about every field (size_x etc.
 * the parent already has those). The merged options are then validated through
 * the usual schema.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  const { id: parentId } = await ctx.params;

  const [parent] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, parentId))
    .limit(1);

  if (!parent) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Owner can always retune. Guest jobs are retunable by anyone with the id
  // (same capability model as the GET endpoint) so the studio page works
  // for signed-out users too.
  const isOwner = userId && parent.userId === userId;
  const isGuestJob = parent.userId === GUEST_USER_ID;
  if (!isOwner && !isGuestJob) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (parent.status !== "done") {
    return NextResponse.json(
      { error: "parent_not_done", parentStatus: parent.status },
      { status: 409 },
    );
  }

  // The worker sets timings_ms.has_depth_cache = 1 on full runs. If it's
  // missing (older job, or a failed cache upload) the retune fast-path would
  // blow up on the download step — reject up front with a useful error so
  // the client can fall back to creating a fresh full job.
  const timings = (parent.timingsMs ?? {}) as Record<string, unknown>;
  if (timings.has_depth_cache !== 1) {
    return NextResponse.json(
      { error: "no_depth_cache", hint: "run a full job first" },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const patch = (body?.options ?? {}) as Record<string, unknown>;

  // Merge parent options + patch; re-validate so a bad client can't sneak
  // through an out-of-range value.
  const parentOptions = (parent.options ?? {}) as Record<string, unknown>;
  const merged = {
    ...parentOptions,
    ...patch,
    reuse_depth_from_job: parentId,
  };
  const parsed = jobOptionsSchema.safeParse(merged);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_options", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const jobId = randomUUID();
  try {
    await db.insert(schema.jobs).values({
      id: jobId,
      userId: parent.userId,
      status: "queued",
      inputKey: parent.inputKey, // still set so the schema is satisfied; worker won't download it on the fast path
      options: parsed.data,
      sourceWidth: parent.sourceWidth,
      sourceHeight: parent.sourceHeight,
    });
  } catch (e) {
    console.error("[api/jobs/retune] insert failed", e);
    return NextResponse.json(
      { error: "insert_failed", detail: String(e) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    jobId,
    status: "queued",
    parentJobId: parentId,
  });
}
