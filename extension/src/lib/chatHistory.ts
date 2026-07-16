import type { Message } from "@combo/shared";

/**
 * Unencrypted chat history in IndexedDB (Phase B).
 *
 * The spec intentionally keeps conversation messages out of the encrypted
 * vault for Phase B; hardening (encrypting history) lands in Phase D. This
 * store is a tiny dedicated IDB database so it can be swapped independently.
 */

const DB_NAME = "combo_chat";
const STORE = "messages";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("failed to open chat history db"));
  });
  return dbPromise;
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("idb request failed"));
  });
}

export async function loadMessages(): Promise<Message[]> {
  const db = await openDb();
  const all = await req<Message[]>(
    db.transaction(STORE, "readonly").objectStore(STORE).getAll() as IDBRequest<Message[]>,
  );
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveMessage(message: Message): Promise<void> {
  const db = await openDb();
  await req(db.transaction(STORE, "readwrite").objectStore(STORE).put(message));
}

export async function clearMessages(): Promise<void> {
  const db = await openDb();
  await req(db.transaction(STORE, "readwrite").objectStore(STORE).clear());
}

export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
