import { UploadDropzone } from "@/components/upload-dropzone";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Upload a photo</h1>
        <p className="text-muted-foreground">
          Drop a JPG, PNG, or BMP — we&apos;ll generate a preview you can tune
          before paying. Landscape and portrait orientations both work.
        </p>
      </div>
      <UploadDropzone />
    </div>
  );
}
