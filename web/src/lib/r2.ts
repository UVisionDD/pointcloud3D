import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { serverEnv } from "@/lib/env";

/**
 * Cloudflare R2 is S3-compatible. Use "auto" for region and sign with SigV4.
 * The custom endpoint form: https://<account_id>.r2.cloudflarestorage.com.
 */
let _client: S3Client | undefined;

function client(): S3Client {
  if (_client) return _client;
  const e = serverEnv();
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: e.R2_ACCESS_KEY_ID,
      secretAccessKey: e.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

function bucket() {
  return serverEnv().R2_BUCKET;
}

export async function presignedUpload(params: {
  key: string;
  contentType: string;
  maxBytes?: number;
  expiresIn?: number;
}): Promise<{ url: string; key: string }> {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: params.key,
    ContentType: params.contentType,
    // R2 respects Content-Length if provided on the upload request.
  });
  const url = await getSignedUrl(client(), cmd, {
    expiresIn: params.expiresIn ?? 60 * 10, // 10 min
  });
  return { url, key: params.key };
}

export async function presignedDownload(params: {
  key: string;
  expiresIn?: number;
  filename?: string;
}): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: params.key,
    ResponseContentDisposition: params.filename
      ? `attachment; filename="${params.filename.replace(/"/g, "")}"`
      : undefined,
  });
  return await getSignedUrl(client(), cmd, {
    expiresIn: params.expiresIn ?? 60 * 60, // 1 hour
  });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export function userImageKey(userId: string, jobId: string, ext: string): string {
  const safe = ext.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "jpg";
  return `inputs/${userId}/${jobId}.${safe}`;
}

export function exportKey(userId: string, jobId: string, format: string): string {
  return `exports/${userId}/${jobId}/result.${format}`;
}
