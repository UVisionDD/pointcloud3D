"use client";

export function PointCloudViewer({ url }: { url: string }) {
  return (
    <div className="flex h-64 items-center justify-center rounded-md bg-muted text-sm text-muted-foreground">
      {url ? "3D Viewer" : "Loading…"}
    </div>
  );
}
