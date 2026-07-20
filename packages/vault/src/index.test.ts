import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  Vault,
  VaultAlreadyInitializedError,
  VaultLockedError,
  VaultReservedLabelError,
  VaultSealedError,
  deriveKek,
  getVaultAlgorithm,
} from "./index.js";

let counter = 0;
function uniqueDb(): string {
  counter += 1;
  return `combo_vault_test_${counter}_${Math.random().toString(36).slice(2)}`;
}

function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function encryptWithKey(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  text: string,
): Promise<Uint8Array> {
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(text),
  );
  return new Uint8Array(buf);
}

describe("@combo/vault constants", () => {
  it("exports vault algorithm constant", () => {
    expect(getVaultAlgorithm()).toBe("AES-GCM");
  });
});

describe("@combo/vault deriveKek", () => {
  it("passphrase derivation is deterministic for the same salt", async () => {
    const salt = randomBytes(16);
    const a = await deriveKek("correct horse battery staple", salt);
    const b = await deriveKek("correct horse battery staple", salt);
    const iv = randomBytes(12);
    const ctA = await encryptWithKey(a, iv, "hello");
    const ctB = await encryptWithKey(b, iv, "hello");
    expect(ctB).toEqual(ctA);
  });

  it("different passphrases derive different keys", async () => {
    const salt = randomBytes(16);
    const a = await deriveKek("alpha", salt);
    const b = await deriveKek("beta", salt);
    const iv = randomBytes(12);
    const ctA = await encryptWithKey(a, iv, "hello");
    const ctB = await encryptWithKey(b, iv, "hello");
    expect(ctB).not.toEqual(ctA);
  });
});

describe("@combo/vault Vault", () => {
  it("encrypt/decrypt roundtrip via put/get", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("s3cret-pass");
    await vault.put("openrouter-key", "sk-or-v1-abc");
    expect(await vault.get("openrouter-key")).toBe("sk-or-v1-abc");
    await vault.close();
  });

  it("wrong passphrase is rejected by unlock", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("right-pass");
    await vault.put("note", "secret");
    await vault.lock();

    const ok = await vault.unlock("wrong-pass");
    expect(ok).toBe(false);
    expect(vault.isUnlocked()).toBe(false);
    await expect(vault.get("note")).rejects.toBeInstanceOf(VaultLockedError);
    await vault.close();
  });

  it("correct passphrase unlocks and reads entries", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("right-pass");
    await vault.put("note", "secret");
    await vault.lock();

    const ok = await vault.unlock("right-pass");
    expect(ok).toBe(true);
    expect(vault.isUnlocked()).toBe(true);
    expect(await vault.get("note")).toBe("secret");
    await vault.close();
  });

  it("IV uniqueness across entries (no reuse)", async () => {
    const dbName = uniqueDb();
    const vault = new Vault({ dbName });
    await vault.setPassphrase("pass");
    for (let i = 0; i < 64; i++) {
      await vault.put(`k${i}`, `v${i}`);
    }
    const ivs = await vault.inspectIvs();
    expect(ivs.length).toBe(64);
    expect(new Set(ivs).size).toBe(64);
    await vault.close();
  });

  it("IndexedDB persistence across simulated reloads", async () => {
    const dbName = uniqueDb();
    const a = new Vault({ dbName });
    await a.setPassphrase("reload-pass");
    await a.put("persisted", "still-here");
    await a.close();

    const b = new Vault({ dbName });
    expect(await b.isInitialized()).toBe(true);
    expect(b.isUnlocked()).toBe(false);
    const ok = await b.unlock("reload-pass");
    expect(ok).toBe(true);
    expect(await b.get("persisted")).toBe("still-here");
    const entries = await b.list();
    expect(entries).toContainEqual({ label: "persisted", createdAt: expect.any(String) });
    await b.close();
  });

  it("locks on window unload via injected listener", async () => {
    const holder: { fn: (() => void) | null } = { fn: null };
    const vault = new Vault({
      dbName: uniqueDb(),
      addEventListener: (_type, listener) => {
        holder.fn = listener;
      },
    });
    await vault.setPassphrase("unload-pass");
    expect(vault.isUnlocked()).toBe(true);
    expect(holder.fn).not.toBeNull();
    const fn = holder.fn;
    if (fn) fn();
    expect(vault.isUnlocked()).toBe(false);
    await vault.close();
  });

  it("list returns entry metadata sorted by label", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("pass");
    await vault.put("zebra", "z");
    await vault.put("alpha", "a");
    await vault.put("mango", "m");
    const labels = (await vault.list()).map((e) => e.label);
    expect(labels).toEqual(["alpha", "mango", "zebra"]);
    await vault.close();
  });

  it("delete removes an entry", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("pass");
    await vault.put("doomed", "x");
    await vault.delete("doomed");
    expect(await vault.get("doomed")).toBeNull();
    await vault.close();
  });

  it("rejects reserved labels", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("pass");
    await expect(vault.put("__salt__", "x")).rejects.toBeInstanceOf(VaultReservedLabelError);
    await vault.close();
  });

  it("setPassphrase twice throws", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("first");
    await expect(vault.setPassphrase("second")).rejects.toBeInstanceOf(
      VaultAlreadyInitializedError,
    );
    await vault.close();
  });

  it("unlock on a sealed vault throws", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await expect(vault.unlock("anything")).rejects.toBeInstanceOf(VaultSealedError);
    await vault.close();
  });

  it("operations while locked throw VaultLockedError", async () => {
    const vault = new Vault({ dbName: uniqueDb() });
    await vault.setPassphrase("pass");
    await vault.lock();
    await expect(vault.put("x", "y")).rejects.toBeInstanceOf(VaultLockedError);
    await vault.close();
  });

  it("uses custom db/store names", async () => {
    const name = uniqueDb();
    const vault = new Vault({ dbName: name, storeName: name });
    await vault.setPassphrase("pass");
    await vault.put("k", "v");
    expect(await vault.get("k")).toBe("v");
    await vault.close();
  });
});
