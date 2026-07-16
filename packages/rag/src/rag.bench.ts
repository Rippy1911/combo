import { bench, describe } from "vitest";
import { MockEmbedder } from "./embedder.js";
import { clearChunks, insertChunks, resetStore, search } from "./store.js";

describe("rag performance", () => {
  bench(
    "P95 search latency under 100ms at 10k chunks",
    async () => {
      await resetStore();
      await clearChunks();
      const embedder = new MockEmbedder();
      const chunks = Array.from({ length: 10_000 }, (_, i) => ({
        content: `Chunk ${i} with searchable content about topic ${i % 100} and keyword alpha${i % 50}`,
        metadata: { id: i },
      }));
      await insertChunks(chunks, embedder);

      const latencies: number[] = [];
      for (let i = 0; i < 100; i++) {
        const start = performance.now();
        await search(`topic ${i % 100}`, 5, embedder);
        latencies.push(performance.now() - start);
      }

      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95 = latencies[p95Index] ?? latencies[latencies.length - 1] ?? 0;
      if (p95 >= 100) {
        throw new Error(`P95 latency ${p95.toFixed(2)}ms exceeds 100ms budget`);
      }
    },
    { time: 1 },
  );
});
