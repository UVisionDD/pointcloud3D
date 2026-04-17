import { eq, and, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";

/**
 * Returns what the user has available right now:
 *  - `subscription`: an active subscription row, or null.
 *  - `paygCredits`: pay-as-you-go balance.
 *
 * Call this before showing the paywall / deciding whether to charge.
 */
export async function getEntitlements(userId: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const [sub] = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.userId, userId),
        eq(schema.subscriptions.status, "active"),
      ),
    )
    .orderBy(schema.subscriptions.createdAt)
    .limit(1);

  return {
    user: user ?? null,
    subscription: sub ?? null,
    paygCredits: user?.paygCredits ?? 0,
  };
}

export function hasExportCapacity(
  ent: Awaited<ReturnType<typeof getEntitlements>>,
): boolean {
  if (ent.paygCredits > 0) return true;
  const s = ent.subscription;
  if (!s) return false;
  if (s.monthlyExports < 0) return true; // unlimited-fair-use
  return s.exportsUsedThisPeriod < s.monthlyExports;
}

/**
 * 30-day re-export window: once a user has paid for a job, they can
 * re-export that same source photo with different parameters for free
 * within 30 days.
 */
export async function hasReexportWindow(userId: string, jobId: string): Promise<boolean> {
  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, jobId), eq(schema.jobs.userId, userId)))
    .limit(1);
  if (!job?.reexportWindowEndsAt) return false;
  return job.reexportWindowEndsAt > new Date();
}
