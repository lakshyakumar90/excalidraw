import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRectangleElement } from "@repo/engine";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { historyStore } from "@/lib/history/historyStore";
import { makeStamp, insertStamp } from "./library";
import type { Element, LibraryItem } from "@repo/common";
const storage = vi.hoisted(() => ({
  files: new Map<
    string,
    { id: string; blob: Blob; mimeType: string; created: number }
  >(),
  events: [] as string[],
}));
vi.mock("./indexedDb", () => ({
  loadFile: vi.fn(async (id: string) => storage.files.get(id)),
  saveFile: vi.fn(
    async (file: {
      id: string;
      blob: Blob;
      mimeType: string;
      created: number;
    }) => {
      storage.files.set(file.id, file);
      storage.events.push("save-file");
    },
  ),
  runStorageTransaction: vi.fn(),
  readStorageRequest: vi.fn(),
}));
vi.mock("@/lib/sync/roomFiles", () => ({
  browserFileIo: {},
  notifyRoomFileAvailable: vi.fn(),
  uploadRoomFiles: vi.fn(async () => {
    expect(scene.size).toBe(0);
    storage.events.push("upload");
  }),
}));
vi.mock("@/lib/sync/commits", () => ({
  commitHistoryEntry: vi.fn(() => storage.events.push("commit")),
}));
beforeEach(() => {
  scene.replaceAll([]);
  selectionStore.clear();
  storage.files.clear();
  storage.events.length = 0;
  vi.stubGlobal("window", {
    innerWidth: 1000,
    innerHeight: 800,
    dispatchEvent: vi.fn(),
  });
});
describe("self-contained library image lifecycle", () => {
  it("saves independent bytes and removes external relationships", async () => {
    const image: Element = {
      ...createRectangleElement({
        id: "image",
        x: 200,
        y: 300,
        frameId: "external",
        boundElements: ["external"],
      }),
      type: "image",
      fileId: "original",
    };
    storage.files.set("original", {
      id: "original",
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      mimeType: "image/png",
      created: 1,
    });
    scene.addElement(image);
    selectionStore.set([image.id]);
    // Node has no FileReader: use the same data URL conversion contract with a small polyfill.
    vi.stubGlobal(
      "FileReader",
      class {
        result: string | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL(blob: Blob) {
          void blob.arrayBuffer().then((bytes) => {
            this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
            this.onload?.();
          });
        }
      },
    );
    const stamp = await makeStamp();
    expect(stamp.elements[0]).toMatchObject({
      x: 0,
      y: 0,
      frameId: null,
      boundElements: [],
    });
    expect(stamp.files.original?.dataURL).toBe("data:image/png;base64,AQID");
    scene.mutateElement(image.id, { x: 999 });
    expect(stamp.elements[0]?.x).toBe(0);
  });
  it("uploads fresh image files before one history insertion and remaps file ids", async () => {
    const image: Element = {
      ...createRectangleElement({ id: "image", width: 20, height: 20 }),
      type: "image",
      fileId: "original",
    };
    const item: LibraryItem = {
      id: "stamp",
      name: "Image",
      updatedAt: "",
      data: {
        version: 1,
        elements: [image],
        files: {
          original: {
            id: "original",
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AQID",
            created: 1,
          },
        },
      },
    };
    const before = historyStore.undoDepth;
    await insertStamp(item, "room");
    expect(storage.events).toEqual(["save-file", "upload", "commit"]);
    const inserted = scene.getElements()[0]!;
    expect(inserted.type === "image" && inserted.fileId).not.toBe("original");
    expect(
      inserted.type === "image" && storage.files.has(inserted.fileId),
    ).toBe(true);
    expect(historyStore.undoDepth).toBe(before + 1);
  });
  it("does not insert after permissions are revoked during file preparation", async () => {
    const item: LibraryItem = {
      id: "stamp",
      name: "Shape",
      updatedAt: "",
      data: {
        version: 1,
        elements: [createRectangleElement({ id: "shape" })],
        files: {},
      },
    };
    await expect(insertStamp(item, "room", () => false)).rejects.toThrow(
      "read only",
    );
    expect(scene.size).toBe(0);
    expect(storage.events).not.toContain("commit");
  });
});
