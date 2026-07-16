import { beforeEach, describe, expect, it } from "vitest";
import { getOverlap, splitText } from "./chunker.js";
import { MockEmbedder } from "./embedder.js";
import {
  bm25Search,
  clearChunks,
  insertChunks,
  reciprocalRankFusion,
  resetStore,
  search,
  vectorSearch,
} from "./store.js";

describe("chunker", () => {
  it("respects overlap between adjacent chunks", () => {
    const text = "word ".repeat(600);
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(1);
    const overlap = getOverlap(chunks[0]?.content, chunks[1]?.content);
    expect(overlap.length).toBeGreaterThanOrEqual(100);
  });

  it("handles Unicode (Polish diacritics + emoji + Chinese)", () => {
    const text = `Zażółć głęślą jaźń 🎉 你好世界. ${"Kolejne zdanie z ąęśćńżź. ".repeat(50)}${"中文测试段落。".repeat(50)}`;
    const chunks = splitText(text);
    expect(chunks.length).toBeGreaterThan(0);
    for (const chunk of chunks) {
      expect(chunk.content).toMatch(/[\u4e00-\u9fff🎉ąęśćńżź]/u);
    }
  });

  it("never splits mid-word when possible", () => {
    const words = Array.from({ length: 500 }, (_, i) => `word${i}`).join(" ");
    const chunks = splitText(words);
    for (const chunk of chunks) {
      const tokens = chunk.content.split(" ");
      for (const token of tokens) {
        if (token) {
          expect(token).toMatch(/^word\d+$/);
        }
      }
    }
  });
});

describe("rag store", () => {
  beforeEach(async () => {
    await resetStore();
    await clearChunks();
  });

  it("insert 100 chunks and search returns top-3 by cosine", async () => {
    const embedder = new MockEmbedder();
    const chunks = Array.from({ length: 100 }, (_, i) => ({
      content: `Document number ${i} about topic ${i % 10}`,
      metadata: { index: i },
    }));
    await insertChunks(chunks, embedder);

    const results = await vectorSearch("Document number 7 about topic 7", 3, embedder);
    expect(results).toHaveLength(3);
    expect(results[0]?.content).toContain("Document number 7");
  });

  it("BM25 keyword search works independently", async () => {
    await insertChunks([
      { content: "The quick brown fox jumps over the lazy dog" },
      { content: "A completely unrelated sentence about mountains" },
      { content: "Another fox story in the forest" },
    ]);

    const results = await bm25Search("fox", 2);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.content.toLowerCase().includes("fox"))).toBe(true);
  });

  it("hybrid search uses reciprocal rank fusion", async () => {
    const listA = [
      { content: "alpha", metadata: {}, score: 0.9 },
      { content: "beta", metadata: {}, score: 0.8 },
    ];
    const listB = [
      { content: "beta", metadata: {}, score: 0.95 },
      { content: "gamma", metadata: {}, score: 0.7 },
    ];
    const fused = reciprocalRankFusion([listA, listB], 3);
    expect(fused[0]?.content).toBe("beta");
    expect(fused).toHaveLength(3);
  });

  it("search combines vector and BM25", async () => {
    const embedder = new MockEmbedder();
    await insertChunks(
      [
        { content: "machine learning neural networks deep learning" },
        { content: "cooking recipes for pasta and sauce" },
        { content: "neural networks for image classification" },
      ],
      embedder,
    );

    const results = await search("neural networks", 2, embedder);
    expect(results.length).toBeLessThanOrEqual(2);
    expect(results.some((r) => r.content.includes("neural"))).toBe(true);
  });
});

describe("MockEmbedder", () => {
  it("produces deterministic 384-dim vectors", async () => {
    const embedder = new MockEmbedder();
    const [v1] = await embedder.embed(["hello"]);
    const [v2] = await embedder.embed(["hello"]);
    expect(v1).toHaveLength(384);
    expect(v1).toEqual(v2);
  });
});
