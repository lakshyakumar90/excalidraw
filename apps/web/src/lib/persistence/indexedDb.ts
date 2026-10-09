import type { Element, Viewport } from "@repo/common";

const DATABASE_NAME = "excalidraw-local";
const DATABASE_VERSION = 3;
const SCENE_STORE = "scene";
const FILE_STORE = "files";
export const ROOM_DRAFT_STORE = "roomDrafts";
export const SYNC_OUTBOX_STORE = "syncOutbox";

export interface PersistedScene {
  id: "current";
  elements: Element[];
  viewport: Viewport;
  savedAt: number;
}

export interface PersistedFile {
  id: string;
  blob: Blob;
  mimeType: string;
  created: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

/** Shared handle for room draft/outbox stores (same database, v2). */
export function getStorageDatabase(): Promise<IDBDatabase> {
  return getDatabase();
}

export async function runStorageTransaction<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const database = await getDatabase();
  const transaction = database.transaction(stores, mode);
  const done = transactionDone(transaction);
  const result = await run(transaction);
  await done;
  return result;
}

export function readStorageRequest<T>(request: IDBRequest<T>): Promise<T> {
  return requestResult(request);
}

function getDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("IndexedDB is unavailable in this browser"),
    );
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("guestLibrary"))
        database.createObjectStore("guestLibrary", { keyPath: "id" });
      if (!database.objectStoreNames.contains(SCENE_STORE)) {
        database.createObjectStore(SCENE_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(FILE_STORE)) {
        database.createObjectStore(FILE_STORE, { keyPath: "id" });
      }
      // Version 2 adds room-scoped drafts and the committed-edit outbox.
      // The guest `current` scene and files are never migrated or touched.
      if (!database.objectStoreNames.contains(ROOM_DRAFT_STORE)) {
        database.createObjectStore(ROOM_DRAFT_STORE, { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains(SYNC_OUTBOX_STORE)) {
        const outbox = database.createObjectStore(SYNC_OUTBOX_STORE, {
          keyPath: "mutationId",
        });
        outbox.createIndex("by-room", "roomKey", { unique: false });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(
        request.error ?? new Error("Could not open local drawing storage"),
      );
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Local drawing storage upgrade is blocked"));
    };
  });

  return databasePromise;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error("Local drawing storage was aborted"),
      );
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Local drawing storage failed"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        request.error ?? new Error("Local drawing storage request failed"),
      );
  });
}

export async function loadScene(): Promise<PersistedScene | null> {
  const database = await getDatabase();
  const transaction = database.transaction(SCENE_STORE, "readonly");
  const done = transactionDone(transaction);
  const result = await requestResult(
    transaction.objectStore(SCENE_STORE).get("current"),
  );
  await done;
  return (result as PersistedScene | undefined) ?? null;
}

export async function saveScene(
  elements: readonly Element[],
  viewport: Viewport,
): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(SCENE_STORE, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(SCENE_STORE).put({
    id: "current",
    elements: structuredClone([...elements]),
    viewport: { ...viewport },
    savedAt: Date.now(),
  } satisfies PersistedScene);
  await done;
}

export async function saveFile(file: PersistedFile): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(FILE_STORE, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(FILE_STORE).put(file);
  await done;
}

export async function loadFile(id: string): Promise<PersistedFile | null> {
  const database = await getDatabase();
  const transaction = database.transaction(FILE_STORE, "readonly");
  const done = transactionDone(transaction);
  const result = await requestResult(
    transaction.objectStore(FILE_STORE).get(id),
  );
  await done;
  return (result as PersistedFile | undefined) ?? null;
}

export async function loadFiles(): Promise<PersistedFile[]> {
  const database = await getDatabase();
  const transaction = database.transaction(FILE_STORE, "readonly");
  const done = transactionDone(transaction);
  const result = await requestResult(
    transaction.objectStore(FILE_STORE).getAll(),
  );
  await done;
  return result as PersistedFile[];
}

export async function deleteFile(id: string): Promise<void> {
  const database = await getDatabase();
  const transaction = database.transaction(FILE_STORE, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(FILE_STORE).delete(id);
  await done;
}
