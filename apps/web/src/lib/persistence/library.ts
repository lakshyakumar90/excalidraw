import {
  validateLibraryStamp,
  type LibraryItem,
  type LibraryStamp,
  type LibrarySummary,
} from "@repo/common";
import { selectionClosure, getElementAxisAlignedBounds } from "@repo/engine";
import { apiRequest } from "@/lib/api/request";
import { scene } from "@/lib/scene/scene";
import { selectionStore } from "@/lib/selection/selectionStore";
import { duplicateElements } from "@/lib/selection/elementClipboard";
import { getCurrentViewport } from "./viewportStore";
import {
  loadFile,
  saveFile,
  runStorageTransaction,
  readStorageRequest,
} from "./indexedDb";
import { blobToDataUrl } from "./excalidrawFile";
import {
  browserFileIo,
  uploadRoomFiles,
  notifyRoomFileAvailable,
} from "@/lib/sync/roomFiles";
import { historyStore } from "@/lib/history/historyStore";
import { commitHistoryEntry } from "@/lib/sync/commits";

const STORE = "guestLibrary";
export async function listLibrary(
  signedIn: boolean,
  offset = 0,
): Promise<{ items: LibrarySummary[]; nextOffset: number | null }> {
  if (signedIn) return apiRequest(`/library?offset=${offset}`);
  const items = await runStorageTransaction([STORE], "readonly", (tx) =>
    readStorageRequest<LibraryItem[]>(tx.objectStore(STORE).getAll()),
  );
  return {
    items: items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    nextOffset: null,
  };
}
export async function getLibraryItem(
  signedIn: boolean,
  id: string,
): Promise<LibraryItem> {
  if (signedIn)
    return (
      await apiRequest<{ item: LibraryItem }>(
        `/library/${encodeURIComponent(id)}`,
      )
    ).item;
  const item = await runStorageTransaction([STORE], "readonly", (tx) =>
    readStorageRequest<LibraryItem | undefined>(tx.objectStore(STORE).get(id)),
  );
  if (!item) throw Error("Stamp no longer exists");
  return item;
}
export async function makeStamp(): Promise<LibraryStamp> {
  const elements = structuredClone(
    selectionClosure(
      scene.getRenderableElements(),
      selectionStore.getSnapshot(),
    ),
  );
  if (!elements.length) throw Error("Select elements to save a stamp");
  const bounds = elements.map(getElementAxisAlignedBounds),
    minX = Math.min(...bounds.map((b) => b.minX)),
    minY = Math.min(...bounds.map((b) => b.minY));
  const ids = new Set(elements.map((e) => e.id));
  const files: LibraryStamp["files"] = {};
  for (const e of elements) {
    e.x -= minX;
    e.y -= minY;
    e.boundElements = e.boundElements?.filter((id) => ids.has(id));
    if (e.frameId && !ids.has(e.frameId)) e.frameId = null;
    if (e.type === "text" && e.containerId && !ids.has(e.containerId))
      delete e.containerId;
    if (e.type === "arrow")
      for (const key of ["startBinding", "endBinding"] as const)
        if (e[key] && !ids.has(e[key]!.elementId)) e[key] = null;
    if (e.type === "image" && !files[e.fileId]) {
      const f = await loadFile(e.fileId);
      if (!f) throw Error("Wait for the image to finish loading before saving");
      files[e.fileId] = {
        id: e.fileId,
        mimeType: f.mimeType,
        dataURL: await blobToDataUrl(f.blob),
        created: f.created,
      };
    }
  }
  const data: LibraryStamp = { version: 1, elements, files };
  if (!validateLibraryStamp(data))
    throw Error(
      "This selection exceeds library limits or contains unsupported image data",
    );
  return data;
}
export async function saveLibraryItem(signedIn: boolean, name: string) {
  const data = await makeStamp();
  if (signedIn) {
    await apiRequest("/library", {
      method: "POST",
      body: JSON.stringify({ name, data }),
    });
    return;
  }
  const { items } = await listLibrary(false);
  if (items.length >= 200)
    throw Error("Your device library is full (200 stamps)");
  const item: LibraryItem = {
    id: crypto.randomUUID(),
    name,
    data,
    updatedAt: new Date().toISOString(),
  };
  await runStorageTransaction([STORE], "readwrite", (tx) =>
    readStorageRequest(tx.objectStore(STORE).put(item)),
  );
}
export async function changeLibraryItem(
  signedIn: boolean,
  id: string,
  name?: string,
) {
  if (signedIn) {
    await apiRequest(`/library/${encodeURIComponent(id)}`, {
      method: name === undefined ? "DELETE" : "PATCH",
      ...(name === undefined ? {} : { body: JSON.stringify({ name }) }),
    });
    return;
  }
  if (name === undefined) {
    await runStorageTransaction([STORE], "readwrite", (tx) =>
      readStorageRequest(tx.objectStore(STORE).delete(id)),
    );
    return;
  }
  const item = await getLibraryItem(false, id);
  item.name = name;
  item.updatedAt = new Date().toISOString();
  await runStorageTransaction([STORE], "readwrite", (tx) =>
    readStorageRequest(tx.objectStore(STORE).put(item)),
  );
}
export async function insertStamp(
  item: LibraryItem,
  roomId?: string,
  canEdit: () => boolean = () => true,
) {
  if (!validateLibraryStamp(item.data)) throw Error("This stamp is invalid");
  const v = getCurrentViewport();
  const bounds = item.data.elements.map(getElementAxisAlignedBounds),
    cx =
      (Math.min(...bounds.map((b) => b.minX)) +
        Math.max(...bounds.map((b) => b.maxX))) /
      2,
    cy =
      (Math.min(...bounds.map((b) => b.minY)) +
        Math.max(...bounds.map((b) => b.maxY))) /
      2;
  const elements = duplicateElements(
    item.data.elements,
    (window.innerWidth / 2 - v.scrollX) / v.zoom - cx,
    (window.innerHeight / 2 - v.scrollY) / v.zoom - cy,
  );
  const fileIds = new Map<string, string>();
  for (const [oldId, f] of Object.entries(item.data.files)) {
    const id = crypto.randomUUID();
    fileIds.set(oldId, id);
    const blob = await (await fetch(f.dataURL)).blob();
    await saveFile({ id, blob, mimeType: f.mimeType, created: Date.now() });
    notifyRoomFileAvailable(id);
  }
  for (const e of elements)
    if (e.type === "image") e.fileId = fileIds.get(e.fileId)!;
  if (roomId) await uploadRoomFiles(browserFileIo, roomId, elements, new Set());
  if (!canEdit())
    throw Error("Room permissions changed. This drawing is now read only.");
  window.dispatchEvent(new Event("canvas-user-interaction"));
  const { changes } = historyStore.commitUpdate(() => {
    for (const e of elements) scene.addElement(e);
    selectionStore.set(elements.map((e) => e.id));
  });
  commitHistoryEntry(changes, "local");
}
