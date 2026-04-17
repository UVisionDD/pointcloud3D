"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdvancedParams } from "@/components/advanced-params";
import { PresetPicker } from "@/components/preset-picker";
import { DEFAULT_JOB_OPTIONS } from "@/lib/presets";
import type { JobOptions } from "@/lib/jobs";

const ACCEPTED = ["image/jpeg", "image/png", "image/bmp"] as const;
const MAX_BYTES = 50 * 1024 * 1024;

type AcceptedMime = (typeof ACCEPTED)[number];

export function UploadDropzone() {
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<JobOptions>(
    DEFAULT_JOB_OPTIONS as JobOptions,
  );

  const onPick = useCallback((f: File) => {
    if (!ACCEPTED.includes(f.type as AcceptedMime)) {
      toast.error("Unsupported file type. Use JPG, PNG, or BMP.");
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error("File too large (max 50 MB).");
      return;
    }
    setFile(f);
  }, []);

  const submit = useCallback(async () => {
    if (!file) return;
    setBusy(true);
    try {
      // 1) Request presigned URL.
      const up = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type as AcceptedMime,
          sizeBytes: file.size,
        }),
      });
      if (!up.ok) throw new Error(`upload-url failed: ${up.status}`);
      const { uploadUrl, key } = (await up.json()) as {
        uploadUrl: string;
        key: string;
      };

      // 2) PUT the file directly to R2.
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(`R2 upload failed: ${put.status}`);

      // 3) Read image dimensions locally.
      const dims = await readImageDims(file).catch(() => null);

      // 4) Create the job.
      const jobResp = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputKey: key,
          options,
          sourceWidth: dims?.w,
          sourceHeight: dims?.h,
        }),
      });
      if (!jobResp.ok) throw new Error(`create job failed: ${jobResp.status}`);
      const { jobId } = (await jobResp.json()) as { jobId: string };
      toast.success("Upload complete — processing…");
      router.push(`/dashboard/jobs/${jobId}`);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }, [file, options, router]);

  return (
    <div className="space-y-6">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) onPick(f);
        }}
        onClick={() => fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-12 text-muted-foreground hover:bg-accent/40"
      >
        <Upload className="h-8 w-8" />
        <div className="text-sm">
          {file ? (
            <span>
              <span className="font-medium text-foreground">{file.name}</span>{" "}
              · {(file.size / (1024 * 1024)).toFixed(1)} MB
            </span>
          ) : (
            <>Drop an image here or click to choose. JPG / PNG / BMP, up to 50 MB.</>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
          }}
        />
      </div>

      <PresetPicker options={options} onChange={setOptions} />
      <AdvancedParams options={options} onChange={setOptions} />

      <div className="flex justify-end">
        <Button size="lg" disabled={!file || busy} onClick={submit}>
          {busy ? "Uploading…" : "Generate point cloud"}
        </Button>
      </div>
    </div>
  );
}

function readImageDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
