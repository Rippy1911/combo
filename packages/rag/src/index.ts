/** RAG chunk representation (pglite + pgvector in Phase B). */
export interface RagChunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, string>;
}

/** RAG store interface stub. */
export interface RagStore {
  index(chunks: RagChunk[]): Promise<void>;
  search(query: string, limit?: number): Promise<RagChunk[]>;
}

export const RAG_ENGINE = "pglite-pgvector" as const;

export function getRagEngine(): typeof RAG_ENGINE {
  return RAG_ENGINE;
}
