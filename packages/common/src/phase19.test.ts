import { describe, expect, it } from "vitest";
import { validateLibraryStamp } from "./library.js";
import { validateSyncElement } from "./syncValidate.js";
import { validateClientCollabMessage } from "./collab.js";
const rect = {
  id: "a",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  version: 1,
  versionNonce: 1,
};
describe("Phase 19 wire boundaries", () => {
  it("accepts flat frames and rejects rotated/nested frames", () => {
    expect(
      validateSyncElement({ ...rect, type: "frame", name: "Frame" }).ok,
    ).toBe(true);
    expect(validateSyncElement({ ...rect, type: "frame", angle: 0.1 }).ok).toBe(
      false,
    );
    expect(
      validateSyncElement({ ...rect, type: "frame", frameId: "other" }).ok,
    ).toBe(false);
  });
  it("accepts a self-contained stamp, rejects duplicate ids and dangling references", () => {
    const stamp = { version: 1, elements: [rect], files: {} };
    expect(validateLibraryStamp(stamp)).toBe(true);
    expect(validateLibraryStamp({ ...stamp, elements: [rect, rect] })).toBe(
      false,
    );
    expect(
      validateLibraryStamp({
        ...stamp,
        elements: [{ ...rect, frameId: "missing" }],
      }),
    ).toBe(false);
    expect(
      validateLibraryStamp({
        ...stamp,
        elements: [{ ...rect, boundElements: ["missing"] }],
      }),
    ).toBe(false);
  });
  it("requires image bytes and supported bitmap MIME types", () => {
    const image = { ...rect, type: "image", fileId: "file" };
    expect(
      validateLibraryStamp({ version: 1, elements: [image], files: {} }),
    ).toBe(false);
    expect(
      validateLibraryStamp({
        version: 1,
        elements: [image],
        files: {
          file: {
            id: "file",
            mimeType: "image/png",
            dataURL: "data:image/png;base64,AAAA",
            created: 1,
          },
        },
      }),
    ).toBe(true);
    expect(
      validateLibraryStamp({
        version: 1,
        elements: [image],
        files: {
          file: {
            id: "file",
            mimeType: "image/svg+xml",
            dataURL: "data:image/svg+xml;base64,AAAA",
            created: 1,
          },
        },
      }),
    ).toBe(false);
  });
  it("bounds laser coordinates/count and rejects forged identity", () => {
    const frame = {
      type: "laser.move",
      gestureId: "gesture",
      seq: 1,
      points: [{ x: 10, y: 20 }],
    };
    expect(validateClientCollabMessage(frame).ok).toBe(true);
    expect(validateClientCollabMessage({ ...frame, userId: "other" }).ok).toBe(
      false,
    );
    expect(
      validateClientCollabMessage({
        ...frame,
        points: Array(33).fill({ x: 0, y: 0 }),
      }).ok,
    ).toBe(false);
    expect(
      validateClientCollabMessage({ ...frame, points: [{ x: Infinity, y: 0 }] })
        .ok,
    ).toBe(false);
  });
});
