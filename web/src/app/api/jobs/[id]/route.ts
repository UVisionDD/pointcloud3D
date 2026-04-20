import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Jobs backend is not configured." },
    { status: 503 },
  );
}
