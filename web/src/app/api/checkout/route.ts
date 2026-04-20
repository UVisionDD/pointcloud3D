import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Checkout is not configured. Set Stripe env vars on Vercel." },
    { status: 503 },
  );
}
