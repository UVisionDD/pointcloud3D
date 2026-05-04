import { z } from "zod";

/**
 * Central env validator. Import `env` anywhere a server route / server component
 * needs a secret — this throws at first import if something's missing, which
 * is a much better failure mode than silent undefined at runtime.
 */
const serverSchema = z.object({
  // DB
  DATABASE_URL: z.string().min(1),

  // Clerk
  CLERK_SECRET_KEY: z.string().min(1),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  // Optional custom R2 public URL, e.g. https://cdn.pointcloud3d.com
  R2_PUBLIC_URL: z.string().url().optional(),

  // Stripe
  // Optional so the app can build without Stripe wired up yet. Runtime
  // checkout/webhook routes will throw if these are missing when invoked.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PAYG_SINGLE: z.string().optional(),
  STRIPE_PRICE_PAYG_THREE_PACK: z.string().optional(),
  STRIPE_PRICE_SUB_BASIC: z.string().optional(),
  STRIPE_PRICE_SUB_PRO: z.string().optional(),
  STRIPE_PRICE_SUB_MAX: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // Worker (used when web calls worker directly via tunnel)
  WORKER_BASE_URL: z.string().url().optional(),
  WORKER_SHARED_SECRET: z.string().optional(),

  // Comma-separated list of in-app bypass codes that unlock a job for free
  // (e.g. "FREEDAAN,TESTER1"). Compared case-insensitively. Leave unset to disable.
  DISCOUNT_CODES: z.string().optional(),
  // How many PAYG credits a code grants when redeemed from the pricing page
  // (no specific job). Per-job redemption ignores this. Default 99.
  DISCOUNT_CODE_CREDITS: z.coerce.number().int().positive().optional(),
});

const publicSchema = z.object({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

function parseServer() {
  if (typeof window !== "undefined") {
    throw new Error("`serverEnv` may not be imported from the client bundle.");
  }
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid server env:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid server env — see console.");
  }
  return parsed.data;
}

function parsePublic() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!parsed.success) {
    console.error("Invalid public env:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid public env — see console.");
  }
  return parsed.data;
}

export const publicEnv = parsePublic();

// Lazy server env so this file can also be imported from components that
// Next.js later determines are client — the actual access happens server-side.
let _serverEnv: ReturnType<typeof parseServer> | undefined;
export function serverEnv() {
  if (!_serverEnv) _serverEnv = parseServer();
  return _serverEnv;
}
