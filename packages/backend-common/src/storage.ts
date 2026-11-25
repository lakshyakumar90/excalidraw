import { createHash, createHmac, randomUUID } from "node:crypto";

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface ObjectStorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Optional custom S3-compatible endpoint (e.g. Cloudflare R2, MinIO). */
  endpoint?: string;
  /** Optional public CDN base URL for reads. */
  publicBaseUrl?: string;
}

export interface PresignUploadRequest {
  mimeType: string;
  sizeBytes: number;
  fileId?: string;
  prefix?: string;
  expiresInSeconds?: number;
}

export interface PresignUploadResponse {
  fileId: string;
  objectKey: string;
  uploadUrl: string;
  downloadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
  storageMode: "s3" | "local";
}

export function validateImageUploadInput(input: {
  mimeType: unknown;
  sizeBytes: unknown;
}): { ok: true; mimeType: string; sizeBytes: number } | { ok: false; error: string } {
  if (
    typeof input.mimeType !== "string" ||
    !ALLOWED_IMAGE_MIME_TYPES.has(input.mimeType)
  ) {
    return {
      ok: false,
      error:
        "Unsupported MIME type. Allowed: image/png, image/jpeg, image/webp, image/svg+xml.",
    };
  }
  if (
    typeof input.sizeBytes !== "number" ||
    !Number.isFinite(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    input.sizeBytes > MAX_UPLOAD_BYTES
  ) {
    return {
      ok: false,
      error: `File size must be between 1 byte and ${MAX_UPLOAD_BYTES} bytes (10 MB).`,
    };
  }
  return { ok: true, mimeType: input.mimeType, sizeBytes: Math.floor(input.sizeBytes) };
}

export function readObjectStorageConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): ObjectStorageConfig | null {
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    bucket,
    region: env.S3_REGION?.trim() || "auto",
    accessKeyId,
    secretAccessKey,
    endpoint: env.S3_ENDPOINT?.trim() || undefined,
    publicBaseUrl: env.S3_PUBLIC_BASE_URL?.trim() || undefined,
  };
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeS3Key(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

/**
 * Generates an AWS Signature Version 4 presigned URL compatible with AWS S3,
 * Cloudflare R2, MinIO, and other S3-compatible object stores.
 */
export function signS3PresignedUrl(params: {
  config: ObjectStorageConfig;
  method: "GET" | "PUT";
  objectKey: string;
  expiresInSeconds?: number;
  contentType?: string;
  now?: Date;
}): string {
  const { config, method, objectKey } = params;
  const expires = Math.max(60, Math.min(3600, Math.floor(params.expiresInSeconds ?? 300)));
  const now = params.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const service = "s3";

  let host: string;
  let protocol: string;
  let canonicalUri: string;

  if (config.endpoint) {
    const parsed = new URL(config.endpoint);
    protocol = parsed.protocol;
    host = parsed.host;
    const basePath = parsed.pathname.replace(/\/+$/, "");
    canonicalUri = `${basePath}/${encodeRfc3986(config.bucket)}/${encodeS3Key(objectKey)}`;
  } else {
    protocol = "https:";
    host = `${config.bucket}.s3.${config.region}.amazonaws.com`;
    canonicalUri = `/${encodeS3Key(objectKey)}`;
  }

  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const signedHeadersList = ["host"];
  const canonicalHeadersLines = [`host:${host}`];
  if (method === "PUT" && params.contentType) {
    signedHeadersList.push("content-type");
    canonicalHeadersLines.push(`content-type:${params.contentType}`);
  }
  signedHeadersList.sort();
  canonicalHeadersLines.sort();
  const signedHeaders = signedHeadersList.join(";");
  const canonicalHeaders = `${canonicalHeadersLines.join("\n")}\n`;

  const queryParams: [string, string][] = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(expires)],
    ["X-Amz-SignedHeaders", signedHeaders],
  ];
  queryParams.sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return `${protocol}//${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export function createPresignedUpload(
  request: PresignUploadRequest,
  config: ObjectStorageConfig | null = readObjectStorageConfigFromEnv(),
  localApiBase = "",
): PresignUploadResponse {
  const fileId = request.fileId?.trim() || randomUUID();
  const prefix = (request.prefix ?? "canvas-assets").replace(/^\/+|\/+$/g, "");
  const ext =
    request.mimeType === "image/png"
      ? "png"
      : request.mimeType === "image/jpeg"
        ? "jpg"
        : request.mimeType === "image/webp"
          ? "webp"
          : "svg";
  const objectKey = `${prefix}/${fileId}.${ext}`;
  const expiresInSeconds = request.expiresInSeconds ?? 300;

  if (!config) {
    const base = localApiBase.replace(/\/+$/, "");
    return {
      fileId,
      objectKey,
      uploadUrl: `${base}/api/files/local/${encodeURIComponent(fileId)}`,
      downloadUrl: `${base}/api/files/${encodeURIComponent(fileId)}`,
      method: "PUT",
      headers: { "Content-Type": request.mimeType },
      expiresInSeconds,
      storageMode: "local",
    };
  }

  const uploadUrl = signS3PresignedUrl({
    config,
    method: "PUT",
    objectKey,
    expiresInSeconds,
    contentType: request.mimeType,
  });

  const downloadUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodeS3Key(objectKey)}`
    : signS3PresignedUrl({
        config,
        method: "GET",
        objectKey,
        expiresInSeconds: 3600,
      });

  return {
    fileId,
    objectKey,
    uploadUrl,
    downloadUrl,
    method: "PUT",
    headers: { "Content-Type": request.mimeType },
    expiresInSeconds,
    storageMode: "s3",
  };
}

export function createPresignedDownloadUrl(
  objectKey: string,
  config: ObjectStorageConfig | null = readObjectStorageConfigFromEnv(),
  expiresInSeconds = 3600,
): string | null {
  if (!config) return null;
  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl.replace(/\/+$/, "")}/${encodeS3Key(objectKey)}`;
  }
  return signS3PresignedUrl({
    config,
    method: "GET",
    objectKey,
    expiresInSeconds,
  });
}
