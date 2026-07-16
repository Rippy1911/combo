/**
 * @vitest-environment jsdom
 */
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveKey, encrypt, generateSalt, timingSafeEqual } from "./crypto.js";
import * as db from "./db.js";
import {
  _resetForTests,
  exportEncrypted,
  get,
  isInitialized,
  isUnlocked,
  list,
  lock,
  put,
  setPassphrase,
  unlock,
} from "./vault.js";

const PASSPHRASE = "test-passphrase-1234";
const WRONG_PASSPHRASE = "wrong-passphrase-9999";

async function clearDatabase(): Promise<void> {
  const request = indexedDB.open("combo_vault", 1);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error("open failed"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("entries")) {
        database.createObjectStore("entries", { keyPath: "label" });
      }
    };
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("entries", "readwrite");
    tx.objectStore("entries").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe("vault crypto", () => {
  it("derives deterministic keys from same passphrase and salt", async () => {
    const salt = await generateSalt();
    const key1 = await deriveKey(PASSPHRASE, salt);
    const key2 = await deriveKey(PASSPHRASE, salt);
    const { ciphertext, iv } = await encrypt(key1, "hello");
    const { decrypt } = await import("./crypto.js");
    const decrypted = await decrypt(key2, ciphertext, iv);
    expect(decrypted).toBe("hello");
  });

  it("encrypt/decrypt roundtrip preserves plaintext exactly", async () => {
    const salt = await generateSalt();
    const key = await deriveKey(PASSPHRASE, salt);
    const plaintext = "secret-api-key-value-🔐";
    const { ciphertext, iv } = await encrypt(key, plaintext);
    const { decrypt } = await import("./crypto.js");
    const result = await decrypt(key, ciphertext, iv);
    expect(result).toBe(plaintext);
  });

  it("timing-safe compare rejects unequal arrays", () => {
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("vault store", () => {
  beforeEach(async () => {
    _resetForTests();
    await clearDatabase();
  });

  afterEach(() => {
    _resetForTests();
  });

  it("wrong passphrase rejects on unlock", async () => {
    await setPassphrase(PASSPHRASE);
    await lock();
    const result = await unlock(WRONG_PASSPHRASE);
    expect(result).toBe(false);
    expect(isUnlocked()).toBe(false);
  });

  it("correct passphrase unlocks vault", async () => {
    await setPassphrase(PASSPHRASE);
    await put("api-key", "sk-test-value");
    await lock();
    const result = await unlock(PASSPHRASE);
    expect(result).toBe(true);
    expect(await get("api-key")).toBe("sk-test-value");
  });

  it("IV uniqueness across 1000 puts", async () => {
    await setPassphrase(PASSPHRASE);
    const ivs = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      await put(`key-${i}`, `value-${i}`);
    }
    const entries = await db.exportAllRecords();
    for (const entry of entries) {
      expect(ivs.has(entry.iv)).toBe(false);
      ivs.add(entry.iv);
    }
    expect(ivs.size).toBe(1000);
  });

  it("persists across simulated page reload", async () => {
    await setPassphrase(PASSPHRASE);
    await put("persist-key", "persist-value");
    await lock();
    _resetForTests();

    expect(await isInitialized()).toBe(true);
    const unlocked = await unlock(PASSPHRASE);
    expect(unlocked).toBe(true);
    expect(await get("persist-key")).toBe("persist-value");
  });

  it("locks on beforeunload event", async () => {
    await setPassphrase(PASSPHRASE);
    expect(isUnlocked()).toBe(true);
    window.dispatchEvent(new Event("beforeunload"));
    expect(isUnlocked()).toBe(false);
  });

  it("get throws when locked", async () => {
    await setPassphrase(PASSPHRASE);
    await put("key", "value");
    await lock();
    await expect(get("key")).rejects.toThrow("Vault is locked");
  });

  it("list returns metadata only", async () => {
    await setPassphrase(PASSPHRASE);
    await put("label-a", "secret-a");
    const entries = await list();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toHaveProperty("label", "label-a");
    expect(entries[0]).toHaveProperty("createdAt");
    expect(entries[0]).not.toHaveProperty("ciphertext");
  });

  it("exportEncrypted returns encrypted backup blob", async () => {
    await setPassphrase(PASSPHRASE);
    await put("backup-key", "backup-value");
    const blob = await exportEncrypted();
    expect(blob.type).toBe("application/json");
    expect(blob.size).toBeGreaterThan(0);
    const entries = await db.exportAllRecords();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain("backup-value");
  });

  it("refuses to run when IndexedDB unavailable", async () => {
    const openSpy = vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const request = {
        onerror: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onupgradeneeded: null as (() => void) | null,
        error: new DOMException("blocked"),
        result: null,
      } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => request.onerror?.(new Event("error")));
      return request;
    });

    await expect(setPassphrase(PASSPHRASE)).rejects.toThrow("IndexedDB is unavailable");
    openSpy.mockRestore();
  });
});
