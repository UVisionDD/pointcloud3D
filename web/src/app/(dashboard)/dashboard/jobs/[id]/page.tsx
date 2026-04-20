import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PointCloudViewer } from "@/components/point-cloud-viewer";
import { JobPoller } from "@/components/job-poller";
import { presignedDownload } from "@/lib/r2";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) return null;
  const { id } = await params;

  const [job] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.id, id), eq(schema.jobs.userId, userId)))
    .limit(1);
  if (!job) notFound();

  const resultKeys = (job.resultKeys ?? {}) as Record<string, string>;
  const previewUrl = resultKeys.ply
    ? await presignedDownload({ key: resultKeys.ply, expiresIn: 60 * 60 })
    : null;

  return (
    <div className="space-y-6">
      <JobPoller jobId={job.id} status={job.status} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Job {job.id.slice(0, 8)}</h1>
          <p className="text-sm text-muted-foreground">
            Created {job.createdAt.toLocaleString()}
          </p>
        </div>
        <Badge
          variant={
            job.status === "done"
              ? "default"
              : job.status === "failed"
                ? "destructive"
                : "secondary"
          }
        >
          {job.status}
        </Badge>
      </div>

      {job.status === "failed" ? (
        <Card>
          <CardHeader>
            <CardTitle>Processing failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{job.error ?? "Unknown error."}</p>
            <Link href="/dashboard/upload">
              <Button variant="outline" size="sm">
                Try another photo
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : job.status !== "done" ? (
        <Card>
          <CardHeader>
            <CardTitle>Processing…</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Progress value={Math.round(job.progress * 100)} />
            <p className="text-sm text-muted-foreground">
              Typical jobs finish in under a minute on the M4.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>3D preview</CardTitle>
            </CardHeader>
            <CardContent>
              {previewUrl ? (
                <PointCloudViewer url={previewUrl} />
              ) : (
                <p className="text-muted-foreground">No preview available.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Downloads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.keys(resultKeys).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No exports yet. If this persists, contact support.
                </p>
              ) : (
                Object.keys(resultKeys).map((fmt) => (
                  <Link
                    key={fmt}
                    href={`/api/jobs/${job.id}/download/${fmt}`}
                    className="block"
                  >
                    <Button
                      variant="outline"
                      className="w-full justify-between"
                    >
                      <span>{fmt.toUpperCase()}</span>
                      <span className="text-xs text-muted-foreground">
                        Download
                      </span>
                    </Button>
                  </Link>
                ))
              )}
              {job.reexportWindowEndsAt ? (
                <p className="pt-2 text-xs text-muted-foreground">
                  Re-exports free until{" "}
                  {job.reexportWindowEndsAt.toLocaleDateString()}.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
