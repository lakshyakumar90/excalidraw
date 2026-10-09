import type { Element } from "@repo/common";
import { loadFile, saveFile } from "@/lib/persistence/indexedDb";
import { blobToDataUrl } from "@/lib/persistence/excalidrawFile";
import { fetchRoomFile, uploadRoomFile } from "@/lib/api/rooms";
import type { SceneFileData } from "@/lib/api/scenes";

/**
 * Image file sync for rooms (Phase 15).
 *
 * Element metadata travels over the collaboration channel while bytes stay
 * on HTTP: uploads attach to the room scene before the referencing commit
 * is reported saved, and downloads hydrate IndexedDB so collaborators can
 * render. Previews never carry blobs. IO is injectable for tests.
 */

export interface FileIo {
  loadFile: (fileId: string) => Promise<{ blob: Blob; mimeType: string; created: number } | null>;
  toDataUrl: (blob: Blob) => Promise<string>;
  upload: (roomId: string, fileId: string, file: SceneFileData) => Promise<number>;
  fetch: (roomId: string, fileId: string) => Promise<SceneFileData>;
  save: (file: { id: string; blob: Blob; mimeType: string; created: number }) => Promise<void>;
  notify: (fileId: string) => void;
}

export function imageFileIds(elements: readonly Element[]): string[] {
  const ids = new Set<string>();
  for (const element of elements) {
    if (element.type === "image" && element.isDeleted !== true) {
      ids.add(element.fileId);
    }
  }
  return [...ids];
}

/** Upload every referenced image not already known durable. */
export async function uploadRoomFiles(
  io: FileIo,
  roomId: string,
  elements: readonly Element[],
  known: Set<string>,
): Promise<string[]> {
  const uploaded: string[] = [];
  for (const fileId of imageFileIds(elements)) {
    if (known.has(fileId)) continue;
    const file = await io.loadFile(fileId);
    if (!file) {
      throw new Error(`Image file "${fileId}" is missing locally`);
    }
    await io.upload(roomId, fileId, {
      id: fileId,
      mimeType: file.mimeType,
      dataURL: await io.toDataUrl(file.blob),
      created: file.created,
    });
    known.add(fileId);
    uploaded.push(fileId);
  }
  return uploaded;
}

/** Fetch referenced images missing from local storage, then notify. */
export async function downloadMissingFiles(
  io: FileIo,
  roomId: string,
  elements: readonly Element[],
): Promise<string[]> {
  const downloaded: string[] = [];
  for (const fileId of imageFileIds(elements)) {
    if (await io.loadFile(fileId)) continue;
    const file = await io.fetch(roomId, fileId);
    if (!file.dataURL.startsWith("data:")) continue;
    const response = await fetch(file.dataURL);
    const blob = await response.blob();
    await io.save({
      id: file.id,
      blob,
      mimeType: file.mimeType || blob.type,
      created: file.created,
    });
    downloaded.push(fileId);
    io.notify(fileId);
  }
  return downloaded;
}

export const browserFileIo: FileIo = {
  loadFile,
  toDataUrl: blobToDataUrl,
  upload: uploadRoomFile,
  fetch: fetchRoomFile,
  save: saveFile,
  notify: (fileId) => notifyRoomFileAvailable(fileId),
};

/** Browser file sync bound to one room (upload-before-commit, fetch-render). */
export function createRoomFileSync(
  roomId: string,
  io: FileIo = browserFileIo,
): {
  upload: (elements: readonly Element[]) => Promise<void>;
  download: (elements: readonly Element[]) => Promise<void>;
  seedKnown: (fileIds: readonly string[]) => void;
} {
  const known = new Set<string>();
  return {
    seedKnown: (fileIds) => {
      for (const fileId of fileIds) known.add(fileId);
    },
    upload: async (elements) => {
      await uploadRoomFiles(io, roomId, elements, known);
    },
    download: async (elements) => {
      await downloadMissingFiles(io, roomId, elements);
    },
  };
}

const ROOM_FILE_EVENT = "excalidraw-room-file";

export function notifyRoomFileAvailable(fileId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(ROOM_FILE_EVENT, { detail: fileId }));
}

export function subscribeRoomFilesAvailable(listener: (fileId: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: Event) => {
    listener((event as CustomEvent<string>).detail);
  };
  window.addEventListener(ROOM_FILE_EVENT, handler);
  return () => window.removeEventListener(ROOM_FILE_EVENT, handler);
}
