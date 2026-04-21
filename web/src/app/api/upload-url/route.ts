import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { presignedUpload, userImageKey } from "@/lib/r2";

const bodySchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/bmp"]),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024), // 50 MB cap.
});

export async function POST(req: Request) {
  const { userId } = await auth();

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const jobId = randomUUID();
  const ext = parsed.data.filename.split(".").pop() ?? "jpg";
  // Guests land under a shared prefix; signed-in uploads stay per-user.
  // Paid export / download is still gated downstream by Clerk + Stripe.
  const key = userImageKey(userId ?? "guest", jobId, ext);

  const { url } = await presignedUpload({
    key,
    contentType: parsed.data.contentType,
  });

  return NextResponse.json({ uploadUrl: url, key, jobId });
}
