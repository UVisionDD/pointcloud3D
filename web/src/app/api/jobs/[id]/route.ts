import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";

const GUEST_USER_ID = "guest";

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

  return NextResponse.json({ job: row });
}
