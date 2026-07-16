import {
  createVerificationBlob,
  decrypt,
  deriveKey,
  encrypt,
  fromBase64,
  generateSalt,
  toBase64,
  verifyKey,
} from "./crypto.js";
import * as db from "./db.js";

let sessionKey: CryptoKey | null = null;
let beforeUnloadRegistered = false;

function ensureUnlocked(): void {
  if (!sessionKey) {
    throw new Error("Vault is locked");
  }
}

function wipeSessionKey(): void {
  sessionKey = null;
}

function registerBeforeUnload(): void {
  if (beforeUnloadRegistered) {
    return;
  }
  const target = typeof window !== "undefined" ? window : globalThis;
  if (typeof target.addEventListener !== "function") {
    return;
  }
  beforeUnloadRegistered = true;
  target.addEventListener("beforeunload", () => {
    wipeSessionKey();
  });
}

async function assertIndexedDB(): Promise<void> {
  const available = await db.isIndexedDBAvailable();
  if (!available) {
    throw new Error("IndexedDB is unavailable — vault refuses to run");
  }
}

export async function setPassphrase(passphrase: string): Promise<void> {
  await assertIndexedDB();
  const existing = await db.getMeta();
  if (existing) {
    throw new Error("Vault already initialized — use unlock instead");
  }

  const salt = await generateSalt();
  const key = await deriveKey(passphrase, salt);
  const verification = await createVerificationBlob(key);

  await db.setMeta({
    salt: toBase64(salt),
    verificationCiphertext: verification.ciphertext,
    verificationIv: verification.iv,
    verificationDigest: verification.digest,
  });

  sessionKey = key;
  registerBeforeUnload();
}

export async function unlock(passphrase: string): Promise<boolean> {
  await assertIndexedDB();
  const meta = await db.getMeta();
  if (!meta) {
    throw new Error("Vault not initialized — use setPassphrase first");
  }

  const salt = fromBase64(meta.salt);
  const key = await deriveKey(passphrase, salt);
  const valid = await verifyKey(
    key,
    meta.verificationCiphertext,
    meta.verificationIv,
    meta.verificationDigest,
  );

  if (!valid) {
    wipeSessionKey();
    return false;
  }

  sessionKey = key;
  registerBeforeUnload();
  return true;
}

export async function lock(): Promise<void> {
  wipeSessionKey();
}

export function isUnlocked(): boolean {
  return sessionKey !== null;
}

export async function put(label: string, plaintext: string): Promise<void> {
  ensureUnlocked();
  const key = sessionKey;
  if (!key) {
    throw new Error("Vault is locked");
  }
  const { ciphertext, iv } = await encrypt(key, plaintext);
  const existing = await db.getEntry(label);
  await db.putEntry({
    label,
    ciphertext,
    iv,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  });
}

export async function get(label: string): Promise<string> {
  ensureUnlocked();
  const entry = await db.getEntry(label);
  if (!entry) {
    throw new Error(`No entry found for label: ${label}`);
  }
  const key = sessionKey;
  if (!key) {
    throw new Error("Vault is locked");
  }
  return decrypt(key, entry.ciphertext, entry.iv);
}

export async function list(): Promise<{ label: string; createdAt: string }[]> {
  return db.listEntries();
}

export async function deleteEntry(label: string): Promise<void> {
  await db.deleteEntry(label);
}

export async function exportEncrypted(): Promise<Blob> {
  const meta = await db.getMeta();
  if (!meta) {
    throw new Error("Vault not initialized");
  }
  const entries = await db.exportAllRecords();
  const payload = JSON.stringify({ meta, entries });
  return new Blob([payload], { type: "application/json" });
}

export async function isInitialized(): Promise<boolean> {
  await assertIndexedDB();
  const meta = await db.getMeta();
  return meta !== null;
}

/** Reset vault state for tests only. */
export function _resetForTests(): void {
  wipeSessionKey();
  beforeUnloadRegistered = false;
}
