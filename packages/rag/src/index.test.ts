import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import {
  PgliteRagStore,
  RAG_DEFAULT_DIMENSIONS,
  type RagChunk,
  chunkText,
  cosineSimilarity,
  getRagEngine,
  mockVector,
} from "./index.js";

describe("@combo/rag constants", () => {
  it("exports RAG engine identifier", () => {
    expect(getRagEngine()).toBe("pglite-pgvector");
  });
});

describe("@combo/rag mockVector + cosineSimilarity", () => {
  it("is deterministic for the same text", () => {
    expect(mockVector("hello world")).toEqual(mockVector("hello world"));
  });

  it("produces normalized 384-dim vectors", () => {
    const v = mockVector("alpha beta");
    expect(v.length).toBe(RAG_DEFAULT_DIMENSIONS);
    let norm = 0;
    for (const x of v) norm += x * x;
    expect(norm).toBeCloseTo(1, 6);
  });

  it("ranks a shared-token chunk above an unrelated one", () => {
    const q = mockVector("alpha beta");
    const related = mockVector("alpha beta gamma");
    const unrelated = mockVector("zeta delta");
    expect(cosineSimilarity(q, related)).toBeGreaterThan(cosineSimilarity(q, unrelated));
  });

  it("throws on dimension mismatch", () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
  });
});

describe("@combo/rag chunkText", () => {
  it("respects the overlap between consecutive chunks", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";
    const chunks = chunkText(text, { maxChunkSize: 20, overlap: 6 });
    expect(chunks.length).toBeGreaterThan(1);
    // The tail of chunk[i-1] must appear at the start of chunk[i].
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1].slice(-6);
      expect(chunks[i].startsWith(prevTail)).toBe(true);
    }
  });

  it("handles unicode text without corrupting characters", () => {
    const text = "Alfa\n\nBrżo\n\nCafé\n\nNaïve";
    const chunks = chunkText(text, { maxChunkSize: 8, overlap: 0 });
    expect(chunks).toEqual(["Alfa", "Brżo", "Café", "Naïve"]);
  });

  it("returns [] for empty/whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("hard-splits a single long token at the char fallback", () => {
    const long = "x".repeat(30);
    const chunks = chunkText(long, { maxChunkSize: 10, overlap: 0 });
    expect(chunks.length).toBe(3);
    expect(chunks.join("")).toBe(long);
  });
});

describe("@combo/rag PgliteRagStore", () => {
  let pg: PGlite;

  afterEach(async () => {
    if (pg) await pg.close().catch(() => {});
  });

  it("store roundtrip: insert 100 chunks and search returns top-3", async () => {
    pg = new PGlite();
    const store = new PgliteRagStore(pg);
    await store.init();

    const chunks: RagChunk[] = [];
    for (let i = 0; i < 100; i++) {
      const content =
        i === 0 ? "alpha beta gamma target" : `document number ${i} filler zeta delta`;
      chunks.push({
        id: `chunk-${i}`,
        documentId: `doc-${i}`,
        content,
        metadata: { index: String(i) },
      });
    }
    await store.index(chunks);

    const results = await store.search("alpha beta target", 3);
    expect(results.length).toBe(3);
    expect(results[0].id).toBe("chunk-0");
    expect(results[0].content).toContain("alpha beta gamma target");
    // Every result is a real stored chunk.
    for (const r of results) {
      expect(r.id).toMatch(/^chunk-\d+$/);
    }
    await store.close();
  }, 60_000);

  it("index is idempotent (upsert by id)", async () => {
    pg = new PGlite();
    const store = new PgliteRagStore(pg);
    await store.init();
    const chunk: RagChunk = {
      id: "c1",
      documentId: "d1",
      content: "hello world",
      metadata: {},
    };
    await store.index([chunk]);
    chunk.content = "updated content";
    await store.index([chunk]);
    const results = await store.search("updated", 5);
    expect(results.some((r) => r.id === "c1" && r.content === "updated content")).toBe(true);
    await store.close();
  }, 60_000);
});
