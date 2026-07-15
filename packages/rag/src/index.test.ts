import { describe, expect, it } from "vitest";
import { getRagEngine } from "./index.js";

describe("@combo/rag", () => {
  it("exports RAG engine identifier", () => {
    expect(getRagEngine()).toBe("pglite-pgvector");
  });
});
