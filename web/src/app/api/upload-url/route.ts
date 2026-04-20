import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Upload backend is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, and DATABASE_URL in Vercel env, then deploy the real /api/upload-url route.",
    },
    { status: 503 },
  );
}
