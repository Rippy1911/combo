import { z } from "zod";

/**
 * Combo encrypted vault.
 *
 * - Web Crypto AES-GCM 256 for confidentiality + integrity (auth tag).
 * - PBKDF2 (100_000 iterations, SHA-256) derives a KEK from the user passphrase.
 * - The KEK lives only in memory for the duration of an unlocked session and
 *   is never persisted. IndexedDB holds only the salt, a verifier blob, and the
 *   per-entry ciphertexts (all encrypted).
 * - The same KEK encrypts every entry; rotating the passphrase therefore
 *   re-derives the KEK and re-wraps the verifier (Phase D will add DEK rotation).
 */

export const VAULT_ALGORITHM = "AES-GCM" as const;
export const VAULT_KDF = "PBKDF2" as const;
export const VAULT_KDF_ITERATIONS = 100_000;
export const VAULT_KDF_HASH = "SHA-256" as const;
export const VAULT_KEY_LENGTH_BITS = 256;
export const VAULT_IV_BYTES = 12;
const VERIFIER_PLAINTEXT = "combo-vault-verifier-v1";

export function getVaultAlgorithm(): typeof VAULT_ALGORITHM {
  return VAULT_ALGORITHM;
}

export const VaultEntrySchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1),
  encryptedValue: z.string(),
  createdAt: z.string().datetime(),
});
export type VaultEntry = z.infer<typeof VaultEntrySchema>;

export interface VaultEntryMetadata {
  label: string;
  createdAt: string;
}

/** Minimal vault surface (kept for the Phase A contract). */
export interface VaultStore {
  lock(): Promise<void>;
  unlock(passphrase: string): Promise<boolean>;
  isUnlocked(): boolean;
}

export interface VaultOptions {
  /** IndexedDB database name. @default "combo_vault" */
  dbName?: string;
  /** IndexedDB object store name. @default "combo_vault" */
  storeName?: string;
  /** IDB factory to use (defaults to globalThis.indexedDB). */
  idbFactory?: IDBFactory | null;
  /** Unload listener registrar (defaults to globalThis.addEventListener). */
  addEventListener?: ((type: "unload", listener: () => void) => void) | null;
}

type MetaRecord = { id: string; kind: "meta"; value: unknown };
type EntryRecord = {
  id: string;
  kind: "entry";
  iv: Uint8Array<ArrayBuffer>;
  ciphertext: Uint8Array<ArrayBuffer>;
  createdAt: string;
};
type StoreRecord = MetaRecord | EntryRecord;

const SALT_KEY = "__salt__";
const VERIFIER_KEY = "__verifier__";
const VERSION_KEY = "__version__";
const RESERVED = new Set([SALT_KEY, VERIFIER_KEY, VERSION_KEY]);

export class VaultLockedError extends Error {
  constructor() {
    super("vault is locked");
    this.name = "VaultLockedError";
  }
}

export class VaultSealedError extends Error {
  constructor() {
    super("vault is not initialized; call setPassphrase first");
    this.name = "VaultSealedError";
  }
}

export class VaultAlreadyInitializedError extends Error {
  constructor() {
    super("vault already has a passphrase; use unlock()");
    this.name = "VaultAlreadyInitializedError";
  }
}

export class VaultReservedLabelError extends Error {
  constructor(label: string) {
    super(`label "${label}" is reserved`);
    this.name = "VaultReservedLabelError";
  }
}

function toBytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text);
}

function randomIv(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(VAULT_IV_BYTES));
}

function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Derive the AES-GCM KEK from a passphrase + salt via PBKDF2. */
export async function deriveKek(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", toBytes(passphrase), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: VAULT_KDF_ITERATIONS, hash: VAULT_KDF_HASH },
    baseKey,
    { name: "AES-GCM", length: VAULT_KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(
  kek: CryptoKey,
  plaintext: string,
): Promise<{ iv: Uint8Array<ArrayBuffer>; ciphertext: Uint8Array<ArrayBuffer> }> {
  const iv = randomIv();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, toBytes(plaintext));
  return { iv, ciphertext: new Uint8Array(cipher) };
}

async function decrypt(
  kek: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  ciphertext: Uint8Array<ArrayBuffer>,
): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, kek, ciphertext);
  return new TextDecoder().decode(plain);
}

function openDb(options: Required<VaultOptions>): Promise<IDBDatabase> {
  const factory = options.idbFactory ?? indexedDB;
  return new Promise((resolve, reject) => {
    const req = factory.open(options.dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(options.storeName)) {
        db.createObjectStore(options.storeName, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("failed to open vault db"));
  });
}

function txStore(db: IDBDatabase, storeName: string, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb request failed"));
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function base64(bytes: Uint8Array<ArrayBuffer>): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export class Vault implements VaultStore {
  private readonly options: Required<VaultOptions>;
  private db: IDBDatabase | null = null;
  private kek: CryptoKey | null = null;
  private initialized = false;
  private readonly unloadListener: () => void;

  constructor(options: VaultOptions = {}) {
    this.options = {
      dbName: options.dbName ?? "combo_vault",
      storeName: options.storeName ?? "combo_vault",
      idbFactory: options.idbFactory === undefined ? null : options.idbFactory,
      addEventListener: options.addEventListener === undefined ? null : options.addEventListener,
    };
    this.unloadListener = () => {
      void this.lock();
    };
    const add = this.options.addEventListener;
    if (add) {
      add("unload", this.unloadListener);
    }
  }

  isUnlocked(): boolean {
    return this.kek !== null;
  }

  private async getDb(): Promise<IDBDatabase> {
    if (!this.db) this.db = await openDb(this.options);
    return this.db;
  }

  private requireKek(): CryptoKey {
    if (!this.kek) throw new VaultLockedError();
    return this.kek;
  }

  private async getMeta<T>(db: IDBDatabase, key: string): Promise<T | null> {
    const rec = await reqToPromise<StoreRecord | undefined>(
      txStore(db, this.options.storeName, "readonly").get(key) as IDBRequest<
        StoreRecord | undefined
      >,
    );
    if (!rec || rec.kind !== "meta") return null;
    return (rec as MetaRecord).value as T;
  }

  private async putMeta(db: IDBDatabase, key: string, value: unknown): Promise<void> {
    const rec: MetaRecord = { id: key, kind: "meta", value };
    await reqToPromise(txStore(db, this.options.storeName, "readwrite").put(rec));
  }

  /** First-run: derive a KEK from the passphrase and persist salt + verifier. */
  async setPassphrase(passphrase: string): Promise<void> {
    if (passphrase.length === 0) throw new Error("passphrase must not be empty");
    const db = await this.getDb();
    const existingSalt = await this.getMeta<Uint8Array<ArrayBuffer>>(db, SALT_KEY);
    if (existingSalt) throw new VaultAlreadyInitializedError();

    const salt = randomSalt();
    const kek = await deriveKek(passphrase, salt);
    const verifier = await encrypt(kek, VERIFIER_PLAINTEXT);

    await this.putMeta(db, SALT_KEY, salt);
    await this.putMeta(db, VERIFIER_KEY, verifier);
    await this.putMeta(db, VERSION_KEY, 1);

    this.kek = kek;
    this.initialized = true;
  }

  /** Re-derive the KEK from the passphrase and verify it against the stored blob. */
  async unlock(passphrase: string): Promise<boolean> {
    if (passphrase.length === 0) return false;
    const db = await this.getDb();
    const salt = await this.getMeta<Uint8Array<ArrayBuffer>>(db, SALT_KEY);
    if (!salt) throw new VaultSealedError();

    const kek = await deriveKek(passphrase, salt);
    const verifier = await this.getMeta<{
      iv: Uint8Array<ArrayBuffer>;
      ciphertext: Uint8Array<ArrayBuffer>;
    }>(db, VERIFIER_KEY);
    if (!verifier) throw new VaultSealedError();

    try {
      const decoded = await decrypt(kek, verifier.iv, verifier.ciphertext);
      if (decoded !== VERIFIER_PLAINTEXT) return false;
    } catch {
      return false;
    }

    this.kek = kek;
    this.initialized = true;
    return true;
  }

  /** Drop the in-memory KEK. Persisted data is untouched. */
  async lock(): Promise<void> {
    this.kek = null;
  }

  /** True once a passphrase (salt + verifier) has been committed to disk. */
  async isInitialized(): Promise<boolean> {
    const db = await this.getDb();
    const salt = await this.getMeta<Uint8Array<ArrayBuffer>>(db, SALT_KEY);
    return salt !== null;
  }

  async put(label: string, plaintext: string): Promise<void> {
    if (RESERVED.has(label)) throw new VaultReservedLabelError(label);
    if (label.length === 0) throw new Error("label must not be empty");
    const kek = this.requireKek();
    const db = await this.getDb();
    const { iv, ciphertext } = await encrypt(kek, plaintext);
    const rec: EntryRecord = { id: label, kind: "entry", iv, ciphertext, createdAt: nowIso() };
    await reqToPromise(txStore(db, this.options.storeName, "readwrite").put(rec));
  }

  async get(label: string): Promise<string | null> {
    const kek = this.requireKek();
    const db = await this.getDb();
    const rec = await reqToPromise<StoreRecord | undefined>(
      txStore(db, this.options.storeName, "readonly").get(label) as IDBRequest<
        StoreRecord | undefined
      >,
    );
    if (!rec || rec.kind !== "entry") return null;
    return decrypt(kek, rec.iv, rec.ciphertext);
  }

  async list(): Promise<VaultEntryMetadata[]> {
    if (!this.initialized && !(await this.isInitialized())) return [];
    const db = await this.getDb();
    const all = await reqToPromise<StoreRecord[]>(
      txStore(db, this.options.storeName, "readonly").getAll() as IDBRequest<StoreRecord[]>,
    );
    return all
      .filter((r): r is EntryRecord => r.kind === "entry")
      .map((r) => ({ label: r.id, createdAt: r.createdAt }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async delete(label: string): Promise<void> {
    if (RESERVED.has(label)) throw new VaultReservedLabelError(label);
    const db = await this.getDb();
    await reqToPromise(txStore(db, this.options.storeName, "readwrite").delete(label));
  }

  /** Close the IndexedDB connection and clear memory. Safe to call repeatedly. */
  async close(): Promise<void> {
    await this.lock();
    this.db?.close();
    this.db = null;
  }

  /** Diagnostic: return base64 IVs for every stored entry (used to assert IV uniqueness). */
  async inspectIvs(): Promise<string[]> {
    const db = await this.getDb();
    const all = await reqToPromise<StoreRecord[]>(
      txStore(db, this.options.storeName, "readonly").getAll() as IDBRequest<StoreRecord[]>,
    );
    return all.filter((r): r is EntryRecord => r.kind === "entry").map((r) => base64(r.iv));
  }
}
