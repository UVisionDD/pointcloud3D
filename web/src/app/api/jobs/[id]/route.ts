import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { presignedDownload } from "@/lib/r2";

// Polling needs fresh state every time; never let Next or any edge cache it.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const GUEST_USER_ID = "guest";

// Order of formats we try for the in-browser 3D preview. PLY is the lightest
// point-cloud format three.js can load natively; GLB is a decent fallback.
const PREVIEW_FORMAT_PRIORITY = ["ply", "glb"] as const;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  const { id } = await ctx.params;

  const [row] = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);

  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Owner can always see their job. Anyone who knows the (UUID v4) job id of
  // a guest job can poll its status — the id is effectively a capability,
  // and paid downloads are gated by a separate Stripe flow.
  const isOwner = userId && row.userId === userId;
  const isGuestJob = row.userId === GUEST_USER_ID;
  if (!isOwner && !isGuestJob) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Once the worker finishes, sign a short-lived GET URL for whichever format
  // works best as an in-browser 3D preview. This is the *preview* URL only —
  // the real download endpoint (`/api/jobs/[id]/download/[fmt]`) still gates
  // on auth + entitlements, and always will.
  let previewUrl: string | null = null;
  let previewFormat: string | null = null;
  // Background-removal PNG preview, produced by preview_only fast-path jobs.
  // Surfaced separately so the UI can swap it into the source pane without
  // mistaking it for the point-cloud preview.
  let bgPreviewUrl: string | null = null;
  if (row.status === "done" && row.resultKeys) {
    const keys = row.resultKeys as Record<string, string>;
    for (const fmt of PREVIEW_FORMAT_PRIORITY) {
      if (keys[fmt]) {
        previewFormat = fmt;
        try {
          previewUrl = await presignedDownload({
            key: keys[fmt],
            expiresIn: 60 * 60, // 1 hour — long enough to view, short enough to re-sign
          });
        } catch {
          previewUrl = null;
        }
        break;
      }
    }
    if (keys.bg_preview) {
      try {
        bgPreviewUrl = await presignedDownload({
          key: keys.bg_preview,
          expiresIn: 60 * 60,
        });
      } catch {
        bgPreviewUrl = null;
      }
    }
  }

  return NextResponse.json({ job: row, previewUrl, previewFormat, bgPreviewUrl });
}
