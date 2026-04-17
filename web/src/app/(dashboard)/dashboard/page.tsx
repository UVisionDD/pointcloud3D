import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";
import { formatDistanceToNow } from "date-fns";

import { db, schema } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getEntitlements } from "@/lib/quota";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [jobs, entitlements] = await Promise.all([
    db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.userId, userId))
      .orderBy(desc(schema.jobs.createdAt))
      .limit(20),
    getEntitlements(userId),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/dashboard/upload">
            <Button>Upload new photo</Button>
          </Link>
          <Link href="/pricing">
            <Button variant="outline">Pricing</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your plan</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            {entitlements.subscription ? (
              <div>
                <div className="font-medium capitalize">
                  {entitlements.subscription.plan} subscription
                </div>
                <div className="text-sm text-muted-foreground">
                  {entitlements.subscription.monthlyExports < 0
                    ? "Unlimited (fair use)"
                    : `${entitlements.subscription.exportsUsedThisPeriod} / ${entitlements.subscription.monthlyExports} exports used`}
                </div>
              </div>
            ) : (
              <div>
                <div className="font-medium">Pay as you go</div>
                <div className="text-sm text-muted-foreground">
                  {entitlements.paygCredits} credit
                  {entitlements.paygCredits === 1 ? "" : "s"} remaining
                </div>
              </div>
            )}
          </div>
          <Link href="/pricing">
            <Button variant="outline" size="sm">
              {entitlements.subscription ? "Manage plan" : "Buy exports"}
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-muted-foreground">
              No jobs yet. Upload your first photo to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between py-3">
                  <div>
                    <Link
                      href={`/dashboard/jobs/${j.id}`}
                      className="font-medium hover:underline"
                    >
                      Job {j.id.slice(0, 8)}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(j.createdAt, { addSuffix: true })}
                    </div>
                  </div>
                  <Badge
                    variant={
                      j.status === "done"
                        ? "default"
                        : j.status === "failed"
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {j.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
