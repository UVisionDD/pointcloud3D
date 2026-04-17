import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { exportKey, presignedDownload } from "@/lib/r2";
import { getEntitlements, hasExportCapacity, hasReexportWindow } from "@/lib/quota";

const ALLOWED = new Set(["ply", "stl", "glb", "dxf", "xyz"]);

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string; format: string }> },
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id, format } = await ctx.params;
  if (!ALLOWED.has(format)) {
    return NextResponse.json({ error: "bad_format" }, { status: 400 });
  }

  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, userId)))
    .limit(1);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.status !== "done") {
    return NextResponse.json({ error: "not_ready" }, { status: 409 });
  }

  const inWindow = await hasReexportWindow(userId, id);
  if (!inWindow) {
    const ent = await getEntitlements(userId);
    if (!hasExportCapacity(ent)) {
      return NextResponse.json({ error: "payment_required" }, { status: 402 });
    }
  }

  const key = exportKey(userId, id, format);
  const url = await presignedDownload({
    key,
    filename: `pointcloud3d-${id.slice(0, 8)}.${format}`,
  });
  return NextResponse.redirect(url);
}
