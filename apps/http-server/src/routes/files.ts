import express, { Router } from "express";
import type { RoomRedis } from "@repo/redis";
import {
  createPresignedDownloadUrl,
  createPresignedUpload,
  MAX_UPLOAD_BYTES,
  readObjectStorageConfigFromEnv,
  validateImageUploadInput,
} from "@repo/backend-common";

interface StoredFileMeta {
  fileId: string;
  objectKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  uploadedBy: string;
  createdAt: number;
  storageMode: "s3" | "local";
}

// In-process registry mapping fileId -> object metadata (and local dev binary blobs when S3 is unconfigured).
const fileRegistry = new Map<string, StoredFileMeta>();
const localBlobStore = new Map<string, { buffer: Buffer; mimeType: string }>();
let metadataRedis: RoomRedis["redis"] | undefined;

export function configureFileMetadataStore(redis: RoomRedis["redis"]) {
  metadataRedis = redis;
}

async function readFileMeta(fileId: string) {
  const local = fileRegistry.get(fileId);
  if (local || !metadataRedis) return local;
  const stored = await metadataRedis.get(`files:metadata:${fileId}`);
  return stored ? JSON.parse(stored) as StoredFileMeta : undefined;
}

export async function getObjectFileDownloadUrl(fileId: string) {
  const meta = await readFileMeta(fileId);
  if (meta?.storageMode !== "s3") return null;
  return createPresignedDownloadUrl(meta.objectKey);
}

export const filesRouter: Router = Router();

/**
 * POST /api/files/presign
 * Validates MIME type and size (<= 10 MB) and returns a presigned S3/R2 PUT URL
 * (or local dev PUT URL when S3_BUCKET is not configured).
 */
filesRouter.post("/presign", async (req, res) => {
  const { mimeType, sizeBytes, width, height, requireObjectStorage } = (req.body ?? {}) as {
    mimeType?: unknown;
    sizeBytes?: unknown;
    width?: unknown;
    height?: unknown;
    requireObjectStorage?: unknown;
  };

  const config = readObjectStorageConfigFromEnv();
  if (!config && requireObjectStorage === true) return res.sendStatus(204);
  const validation = validateImageUploadInput({ mimeType, sizeBytes });
  if (!validation.ok) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const presigned = createPresignedUpload(
    {
      mimeType: validation.mimeType,
      sizeBytes: validation.sizeBytes,
    },
    config,
  );

  const metadata: StoredFileMeta = {
    fileId: presigned.fileId,
    objectKey: presigned.objectKey,
    mimeType: validation.mimeType,
    sizeBytes: validation.sizeBytes,
    width: typeof width === "number" && Number.isFinite(width) ? width : undefined,
    height: typeof height === "number" && Number.isFinite(height) ? height : undefined,
    uploadedBy: req.userId ?? "anonymous",
    createdAt: Date.now(),
    storageMode: presigned.storageMode,
  };
  if (metadata.storageMode === "s3" && metadataRedis)
    await metadataRedis.set(`files:metadata:${metadata.fileId}`, JSON.stringify(metadata));
  else fileRegistry.set(metadata.fileId, metadata);

  res.status(201).json({
    ...presigned,
    metadata: {
      fileId: presigned.fileId,
      mimeType: validation.mimeType,
      width: typeof width === "number" ? width : undefined,
      height: typeof height === "number" ? height : undefined,
    },
  });
});

/**
 * PUT /api/files/local/:fileId
 * Local development fallback upload target when S3/R2 credentials are absent.
 */
filesRouter.put(
  "/local/:fileId",
  express.raw({ type: "image/*", limit: MAX_UPLOAD_BYTES }),
  (req, res) => {
    const fileId = String(req.params.fileId ?? "");
    const meta = fileRegistry.get(fileId);
    if (!meta || meta.storageMode !== "local" || meta.uploadedBy !== req.userId) {
      res.status(404).json({ error: "Presigned local upload not found." });
      return;
    }
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (body.length !== meta.sizeBytes || req.get("content-type") !== meta.mimeType) {
      res.status(400).json({ error: "Invalid image payload size." });
      return;
    }
    localBlobStore.set(fileId, { buffer: body, mimeType: meta.mimeType });
    res.status(200).json({ uploaded: true, fileId, sizeBytes: body.length });
  },
);

/**
 * GET /api/files/:fileId
 * Redirects to a short-lived presigned S3/R2 GET URL (or serves local dev blob).
 */
filesRouter.get("/:fileId", async (req, res) => {
  const fileId = String(req.params.fileId ?? "");
  const meta = await readFileMeta(fileId);
  if (!meta || meta.uploadedBy !== req.userId) {
    res.status(404).json({ error: "File not found." });
    return;
  }

  if (meta.storageMode === "s3") {
    const url = createPresignedDownloadUrl(meta.objectKey);
    if (!url) {
      res.status(503).json({ error: "Object storage is not configured." });
      return;
    }
    if (req.query.url === "1") res.json({ url });
    else res.redirect(302, url);
    return;
  }

  const blob = localBlobStore.get(fileId);
  if (!blob) {
    res.status(404).json({ error: "Local file content not uploaded yet." });
    return;
  }
  res.setHeader("Content-Type", blob.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(blob.buffer);
});
