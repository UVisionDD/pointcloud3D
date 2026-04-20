"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function JobPoller({
  jobId,
  status,
}: {
  jobId: string;
  status: string;
}) {
  const router = useRouter();
  useEffect(() => {
    if (status === "done" || status === "failed") return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [jobId, status, router]);
  return null;
}
