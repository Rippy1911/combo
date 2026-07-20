/**
 * Saved views + a read-only IndexedDB inspector for Combo.
 *
 * Views are table snapshots the agent (or user) saves for later inspection —
 * generic table viewer / export source. The inspector browses Combo's own IDB
 * databases read-only; vault values are NEVER decrypted here (labels +
 * ciphertext shown redacted).
 */

const VIEWS_DB = "combo_views";
const VIEWS_STORE = "views";
const VIEWS_VERSION = 1;

export interface SavedView {
  id: string;
  name: string;
  source: string;
  rows: string[][];
  updatedAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openViewsDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(VIEWS_DB, VIEWS_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VIEWS_STORE)) {
        db.createObjectStore(VIEWS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("failed to open views db"));
  });
  return dbPromise;
}

function reqToPromise<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("idb request failed"));
  });
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const ViewStore = {
  async save(input: { name: string; source: string; rows: string[][] }): Promise<SavedView> {
    const db = await openViewsDb();
    const view: SavedView = {
      id: newId(),
      name: input.name,
      source: input.source,
      rows: input.rows,
      updatedAt: new Date().toISOString(),
    };
    await reqToPromise(db.transaction(VIEWS_STORE, "readwrite").objectStore(VIEWS_STORE).put(view));
    return view;
  },
  async list(): Promise<SavedView[]> {
    const db = await openViewsDb();
    const all = await reqToPromise<SavedView[]>(
      db.transaction(VIEWS_STORE, "readonly").objectStore(VIEWS_STORE).getAll() as IDBRequest<
        SavedView[]
      >,
    );
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async get(id: string): Promise<SavedView | undefined> {
    const db = await openViewsDb();
    return reqToPromise<SavedView | undefined>(
      db.transaction(VIEWS_STORE, "readonly").objectStore(VIEWS_STORE).get(id) as IDBRequest<
        SavedView | undefined
      >,
    );
  },
  async delete(id: string): Promise<void> {
    const db = await openViewsDb();
    await reqToPromise(
      db.transaction(VIEWS_STORE, "readwrite").objectStore(VIEWS_STORE).delete(id),
    );
  },
};

// ── Read-only IDB inspector ──────────────────────────────────────────────────

export interface InspectableDb {
  name: string;
  stores: string[];
  /** When true, value bytes are redacted (vault). */
  redactValues: boolean;
}

export const INSPECTABLE_DBS: InspectableDb[] = [
  { name: "combo_vault", stores: ["combo_vault"], redactValues: true },
  { name: "combo_chat", stores: ["messages"], redactValues: false },
];

export interface InspectRow {
  key: string;
  summary: string;
}

function summarize(value: unknown, redact: boolean, max = 200): string {
  if (value == null) return String(value);
  if (redact) return "<redacted ciphertext>";
  const json = typeof value === "string" ? value : JSON.stringify(value);
  return json.length > max ? `${json.slice(0, max)}…` : json;
}

/** Read up to `limit` records from a store; vault values are redacted. */
export async function inspectStore(
  dbName: string,
  store: string,
  limit = 40,
): Promise<InspectRow[]> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(dbName);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error(`failed to open ${dbName}`));
  });
  const redact = INSPECTABLE_DBS.find((d) => d.name === dbName)?.redactValues ?? false;
  if (!db.objectStoreNames.contains(store)) {
    db.close();
    return [];
  }
  const all = await reqToPromise<unknown[]>(
    db.transaction(store, "readonly").objectStore(store).getAll() as IDBRequest<unknown[]>,
  );
  db.close();
  return all.slice(0, limit).map((rec) => {
    const key = (rec as { id?: string }).id ?? "(no id)";
    return { key: String(key), summary: summarize(rec, redact) };
  });
}
