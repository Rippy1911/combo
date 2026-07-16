export { splitText, getOverlap, CHUNK_SIZE_CHARS, OVERLAP_CHARS } from "./chunker.js";
export type { TextChunk } from "./chunker.js";
export { MockEmbedder, hashToVector, EMBEDDING_DIMENSION } from "./embedder.js";
export type { Embedder } from "./embedder.js";
export {
  initStore,
  resetStore,
  insertChunks,
  vectorSearch,
  bm25Search,
  reciprocalRankFusion,
  search,
  clearChunks,
} from "./store.js";
export type { SearchResult } from "./store.js";

export const RAG_ENGINE = "pglite-pgvector" as const;

export function getRagEngine(): typeof RAG_ENGINE {
  return RAG_ENGINE;
}
