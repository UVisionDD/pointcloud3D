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
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const jobId = randomUUID();
  const ext = parsed.data.filename.split(".").pop() ?? "jpg";
  const key = userImageKey(userId, jobId, ext);

  const { url } = await presignedUpload({
    key,
    contentType: parsed.data.contentType,
  });

  return NextResponse.json({ uploadUrl: url, key, jobId });
}
