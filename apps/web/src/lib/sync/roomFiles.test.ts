import { describe, expect, it, vi } from "vitest";
import {
  downloadMissingFiles,
  imageFileIds,
  uploadRoomFiles,
  type FileIo,
} from "./roomFiles";

function image(id: string, fileId = "file-1") {
  return { id, type: "image", x: 0, y: 0, fileId, version: 2, versionNonce: 2 };
}

function rect(id: string) {
  return { id, type: "rectangle", x: 0, y: 0, version: 2, versionNonce: 2 };
}

function fakeIo(overrides: Partial<FileIo> = {}): FileIo & {
  uploaded: { roomId: string; fileId: string }[];
  saved: { id: string }[];
  notified: string[];
} {
  const io = {
    uploaded: [] as { roomId: string; fileId: string }[],
    saved: [] as { id: string }[],
    notified: [] as string[],
    loadFile: async (fileId: string) =>
      fileId === "file-1"
        ? { blob: new Blob(["bytes"]), mimeType: "image/png", created: 1 }
        : null,
    toDataUrl: async () => "data:image/png;base64,AAA",
    upload: async (roomId: string, fileId: string) => {
      io.uploaded.push({ roomId, fileId });
      return 1;
    },
    fetch: async (_roomId: string, fileId: string) => ({
      id: fileId,
      mimeType: "image/png",
      dataURL: "data:image/png;base64,BBB",
      created: 2,
    }),
    save: async (file: { id: string; blob: Blob; mimeType: string; created: number }) => {
      io.saved.push({ id: file.id });
    },
    notify: (fileId: string) => {
      io.notified.push(fileId);
    },
    ...overrides,
  };
  return io;
}

describe("imageFileIds", () => {
  it("collects live image references only", () => {
    expect(
      imageFileIds([
        image("a", "f1"),
        image("b", "f1"),
        image("c", "f2"),
        { ...image("d", "f3"), isDeleted: true },
        rect("e"),
      ] as never[]),
    ).toEqual(["f1", "f2"]);
  });
});

describe("uploadRoomFiles", () => {
  it("uploads unknown files and skips known ones", async () => {
    const io = fakeIo();
    const known = new Set(["file-9"]);
    const uploaded = await uploadRoomFiles(
      io,
      "1",
      [image("a", "file-1"), image("b", "file-9")] as never[],
      known,
    );
    expect(uploaded).toEqual(["file-1"]);
    expect(io.uploaded).toEqual([{ roomId: "1", fileId: "file-1" }]);
    expect(known.has("file-1")).toBe(true);
  });

  it("fails when local bytes are missing", async () => {
    const io = fakeIo();
    await expect(
      uploadRoomFiles(io, "1", [image("a", "ghost")] as never[], new Set()),
    ).rejects.toThrow(/missing locally/);
    expect(io.uploaded).toEqual([]);
  });
});

describe("downloadMissingFiles", () => {
  it("fetches, saves, and notifies only for missing files", async () => {
    const io = fakeIo();
    const downloaded = await downloadMissingFiles(
      io,
      "1",
      [image("a", "file-1"), image("b", "file-2")] as never[],
    );
    expect(downloaded).toEqual(["file-2"]);
    expect(io.saved).toEqual([{ id: "file-2" }]);
    expect(io.notified).toEqual(["file-2"]);
  });

  it("skips non-data URLs without persisting", async () => {
    const io = fakeIo({
    fetch: async (_roomId: string, fileId: string) => ({
      id: fileId,
      mimeType: "image/png",
      dataURL: "https://cdn.example/x.png",
      created: 2,
    }),
    });
    expect(
      await downloadMissingFiles(io, "1", [image("a", "file-2")] as never[]),
    ).toEqual([]);
    expect(io.saved).toEqual([]);
    expect(io.notified).toEqual([]);
  });
});

describe("upload call shape", () => {
  it("sends file bytes before the referencing commit", async () => {
    const io = fakeIo();
    const upload = vi.spyOn(io, "upload");
    await uploadRoomFiles(io, "7", [image("a")] as never[], new Set());
    expect(upload).toHaveBeenCalledWith("7", "file-1", {
      id: "file-1",
      mimeType: "image/png",
      dataURL: "data:image/png;base64,AAA",
      created: 1,
    });
  });
});
