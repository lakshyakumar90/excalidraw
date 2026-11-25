import { apiUrl } from "./client";

export interface PresignedFileUploadResult {
  fileId: string;
  objectKey: string;
  uploadUrl: string;
  downloadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
  storageMode: "s3" | "local";
  metadata: {
    fileId: string;
    mimeType: string;
    width?: number;
    height?: number;
  };
}

/**
 * Requests a presigned S3/R2 upload URL from the API and uploads the binary
 * image blob directly, returning lightweight metadata for WebSocket sync.
 */
export async function uploadImageViaPresign(
  blob: Blob,
  dims?: { width?: number; height?: number; fileId?: string },
  requireObjectStorage = false,
): Promise<PresignedFileUploadResult | undefined> {
  const presignRes = await fetch(apiUrl("/api/files/presign"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mimeType: blob.type || "image/png",
      sizeBytes: blob.size,
      width: dims?.width,
      height: dims?.height,
      fileId: dims?.fileId,
      requireObjectStorage,
    }),
  });
  if (presignRes.status === 204) return undefined;

  if (!presignRes.ok) {
    const errBody = (await presignRes.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(errBody.error || `Presign failed (${presignRes.status})`);
  }

  const presigned = (await presignRes.json()) as PresignedFileUploadResult;
  const targetUrl = presigned.uploadUrl.startsWith("/")
    ? apiUrl(presigned.uploadUrl)
    : presigned.uploadUrl;

  const putRes = await fetch(targetUrl, {
    method: "PUT",
    headers: presigned.headers,
    credentials: presigned.storageMode === "local" ? "include" : "omit",
    body: blob,
  });

  if (!putRes.ok) {
    throw new Error(`Direct blob upload failed (${putRes.status})`);
  }

  return presigned;
}

export function getRemoteFileUrl(fileId: string): string {
  return apiUrl(`/api/files/${encodeURIComponent(fileId)}`);
}
