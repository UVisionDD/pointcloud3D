"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  jobId: string;
  status: string;
  intervalMs?: number;
}

/**
 * While a job is queued/processing, poll /api/jobs/:id and refresh the page
 * when the status changes so server components re-render with new data.
 */
export function JobPoller({ jobId, status, intervalMs = 3000 }: Props) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);

  useEffect(() => {
    if (current === "done" || current === "failed") return;
    const t = setInterval(async () => {
      try {
        const r = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!r.ok) return;
        const { job } = (await r.json()) as { job: { status: string } };
        if (job.status !== current) {
          setCurrent(job.status);
          router.refresh();
        }
      } catch {
        /* swallow transient */
      }
    }, intervalMs);
    return () => clearInterval(t);
  }, [current, jobId, router, intervalMs]);

  return null;
}
