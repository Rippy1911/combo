const DB_NAME = "combo_vault";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const META_KEY = "__meta__";

export interface VaultMeta {
  salt: string;
  verificationCiphertext: string;
  verificationIv: string;
  verificationDigest: string;
}

export interface VaultEntryRecord {
  label: string;
  ciphertext: string;
  iv: string;
  createdAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "label" });
      }
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = fn(store);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB operation failed"));
    request.onsuccess = () => resolve(request.result);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
  });
}

export async function isIndexedDBAvailable(): Promise<boolean> {
  try {
    const db = await openDatabase();
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function getMeta(): Promise<VaultMeta | null> {
  const result = await withStore("readonly", (store) => store.get(META_KEY));
  return (result as VaultMeta | undefined) ?? null;
}

export async function setMeta(meta: VaultMeta): Promise<void> {
  await withStore("readwrite", (store) => store.put({ label: META_KEY, ...meta }));
}

export async function putEntry(entry: VaultEntryRecord): Promise<void> {
  await withStore("readwrite", (store) => store.put(entry));
}

export async function getEntry(label: string): Promise<VaultEntryRecord | null> {
  const result = await withStore("readonly", (store) => store.get(label));
  return (result as VaultEntryRecord | undefined) ?? null;
}

export async function listEntries(): Promise<{ label: string; createdAt: string }[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error ?? new Error("Failed to list entries"));
    request.onsuccess = () => {
      const records = (request.result as VaultEntryRecord[]) ?? [];
      const entries = records
        .filter((r) => r.label !== META_KEY)
        .map((r) => ({ label: r.label, createdAt: r.createdAt }));
      resolve(entries);
    };
  });
}

export async function deleteEntry(label: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(label));
}

export async function exportAllRecords(): Promise<VaultEntryRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onerror = () => reject(request.error ?? new Error("Failed to export records"));
    request.onsuccess = () => {
      const records = (request.result as VaultEntryRecord[]) ?? [];
      resolve(records.filter((r) => r.label !== META_KEY));
    };
  });
}
