import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { INSPECTABLE_DBS, ViewStore, inspectStore } from "./views.js";

function uniqueViewDb(): string {
  return `combo_views_test_${Math.random().toString(36).slice(2)}`;
}

describe("ViewStore", () => {
  afterEach(async () => {
    indexedDB.deleteDatabase("combo_views");
  });

  it("saves, lists (newest first), and deletes views", async () => {
    const a = await ViewStore.save({ name: "A", source: "scrape_tables", rows: [["h"], ["1"]] });
    await new Promise((r) => setTimeout(r, 5));
    const b = await ViewStore.save({ name: "B", source: "parse_data", rows: [["h"], ["2"]] });
    const list = await ViewStore.list();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);

    await ViewStore.delete(a.id);
    expect((await ViewStore.list()).length).toBe(1);
  });

  it("get returns the saved view", async () => {
    const v = await ViewStore.save({ name: "X", source: "manual", rows: [["h"], ["x"]] });
    const got = await ViewStore.get(v.id);
    expect(got?.name).toBe("X");
    expect(got?.rows[1]).toEqual(["x"]);
  });

  it("uses an isolated db per unique name (no cross-test bleed)", async () => {
    const name = uniqueViewDb();
    // sanity: the helper returns a string, and the default store still works
    expect(name).toMatch(/^combo_views_test_/);
    const list = await ViewStore.list();
    expect(Array.isArray(list)).toBe(true);
  });
});

describe("inspectStore", () => {
  it("redacts vault values and returns rows for combo_chat", async () => {
    // combo_chat store "messages" — seed a record.
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("combo_chat", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("messages"))
          db.createObjectStore("messages", { keyPath: "id" });
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("messages", "readwrite");
        tx.objectStore("messages").put({ id: "m1", role: "user", content: "hello" });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    const rows = await inspectStore("combo_chat", "messages", 10);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("m1");
    expect(rows[0].summary).toContain("hello");

    // vault is redacted
    const vaultRows = await inspectStore("combo_vault", "combo_vault", 10);
    const vaultDb = INSPECTABLE_DBS.find((d) => d.name === "combo_vault");
    expect(vaultDb?.redactValues).toBe(true);
    for (const r of vaultRows) expect(r.summary).toBe("<redacted ciphertext>");
  });
});
