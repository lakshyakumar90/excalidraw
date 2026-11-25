import type { Element } from "@repo/common";
import { loadFile, saveFile } from "@/lib/persistence/indexedDb";
import { blobToDataUrl } from "@/lib/persistence/excalidrawFile";
import { fetchRoomFile, uploadRoomFile } from "@/lib/api/rooms";
import type { SceneFileData } from "@/lib/api/scenes";
import { apiRequest } from "@/lib/api/client";

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
  upload: (roomId: string, fileId: string, file: Omit<SceneFileData, "dataURL"> & { dataURL?: string }, objectKey?: string) => Promise<number>;
  fetch: (roomId: string, fileId: string) => Promise<SceneFileData & { downloadUrl?: string }>;
  uploadBlob?: (roomId: string, fileId: string, mimeType: string, blob: Blob) => Promise<string | undefined>;
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
    const objectKey = await io.uploadBlob?.(roomId, fileId, file.mimeType, file.blob);
    const metadata = {
      id: fileId,
      mimeType: file.mimeType,
      created: file.created,
    };
    if (objectKey) await io.upload(roomId, fileId, metadata, objectKey);
    else await io.upload(roomId, fileId, { ...metadata, dataURL: await io.toDataUrl(file.blob) });
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
    const url = file.downloadUrl ?? (file.dataURL.startsWith("data:") ? file.dataURL : undefined);
    if (!url) continue;
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error(`Could not download room image (${response.status})`);
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
  uploadBlob: async (roomId, fileId, mimeType, blob) => {
    const target = await apiRequest<{ uploadUrl: string; objectKey: string; headers: Record<string, string> } | undefined>(
      `/room/${encodeURIComponent(roomId)}/files/presign`,
      { method: "POST", body: JSON.stringify({ fileId, mimeType, sizeBytes: blob.size }) },
    );
    if (!target) return undefined;
    const response = await fetch(target.uploadUrl, {
      method: "PUT",
      credentials: "omit",
      headers: target.headers,
      body: blob,
    });
    if (!response.ok) throw new Error(`Could not upload room image (${response.status})`);
    return target.objectKey;
  },
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
