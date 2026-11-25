import { describe, expect, it } from "vitest";
import {
  createPresignedUpload,
  MAX_UPLOAD_BYTES,
  signS3PresignedUrl,
  validateImageUploadInput,
} from "./storage.js";

describe("object storage presigning and validation", () => {
  it("validates allowed image MIME types and 10 MB size ceiling", () => {
    expect(
      validateImageUploadInput({ mimeType: "image/png", sizeBytes: 1024 }).ok,
    ).toBe(true);
    expect(
      validateImageUploadInput({ mimeType: "image/webp", sizeBytes: MAX_UPLOAD_BYTES }).ok,
    ).toBe(true);
    expect(
      validateImageUploadInput({ mimeType: "application/pdf", sizeBytes: 1024 }).ok,
    ).toBe(false);
    expect(
      validateImageUploadInput({ mimeType: "image/png", sizeBytes: MAX_UPLOAD_BYTES + 1 }).ok,
    ).toBe(false);
  });

  it("generates AWS SigV4 presigned PUT and GET URLs for S3/R2", () => {
    const config = {
      bucket: "excalidraw-assets",
      region: "auto",
      endpoint: "https://acct123.r2.cloudflarestorage.com",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "SECRETEXAMPLE",
    };

    const url = signS3PresignedUrl({
      config,
      method: "PUT",
      objectKey: "canvas-assets/img-1.png",
      contentType: "image/png",
      expiresInSeconds: 300,
      now: new Date("2026-11-25T00:00:00.000Z"),
    });

    expect(url).toContain("https://acct123.r2.cloudflarestorage.com/excalidraw-assets/canvas-assets/img-1.png");
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-SignedHeaders=content-type%3Bhost");

    const presigned = createPresignedUpload(
      { mimeType: "image/webp", sizeBytes: 2048, fileId: "file-abc" },
      config,
    );
    expect(presigned.storageMode).toBe("s3");
    expect(presigned.fileId).toBe("file-abc");
    expect(presigned.objectKey).toBe("canvas-assets/file-abc.webp");
    expect(new URL(presigned.uploadUrl).searchParams.get("X-Amz-SignedHeaders"))
      .toBe("content-length;content-type;host");
  });

  it("falls back to local storage URLs when S3 credentials are not configured", () => {
    const presigned = createPresignedUpload(
      { mimeType: "image/png", sizeBytes: 512, fileId: "local-1" },
      null,
    );
    expect(presigned.storageMode).toBe("local");
    expect(presigned.uploadUrl).toBe("/api/files/local/local-1");
    expect(presigned.downloadUrl).toBe("/api/files/local-1");
  });
});
