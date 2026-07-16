import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { MockEmbedder } from "./embedder.js";

export interface SearchResult {
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

let dbInstance: PGlite | null = null;

export async function initStore(): Promise<PGlite> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await PGlite.create({
    extensions: { vector },
  });

  await dbInstance.exec("CREATE EXTENSION IF NOT EXISTS vector;");
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      content TEXT NOT NULL,
      embedding vector(384),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(),
      content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED
    );
  `);
  await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS chunks_embedding_idx
    ON chunks USING hnsw (embedding vector_cosine_ops);
  `);
  await dbInstance.exec(`
    CREATE INDEX IF NOT EXISTS chunks_content_tsv_idx
    ON chunks USING gin (content_tsv);
  `);

  return dbInstance;
}

export async function resetStore(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

function vectorToSql(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export async function insertChunks(
  chunks: { content: string; metadata?: Record<string, unknown> }[],
  embedder = new MockEmbedder(),
): Promise<void> {
  const db = await initStore();
  const texts = chunks.map((c) => c.content);
  const embeddings = await embedder.embed(texts);
  const batchSize = 100;

  for (let offset = 0; offset < chunks.length; offset += batchSize) {
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    for (let i = offset; i < Math.min(offset + batchSize, chunks.length); i++) {
      const chunk = chunks[i];
      const embedding = embeddings[i];
      if (!chunk || !embedding) {
        continue;
      }
      values.push(`($${paramIndex}, $${paramIndex + 1}::vector, $${paramIndex + 2}::jsonb)`);
      params.push(chunk.content, vectorToSql(embedding), JSON.stringify(chunk.metadata ?? {}));
      paramIndex += 3;
    }

    if (values.length === 0) {
      continue;
    }

    await db.query(
      `INSERT INTO chunks (content, embedding, metadata) VALUES ${values.join(", ")}`,
      params,
    );
  }
}

export async function vectorSearch(
  query: string,
  topK: number,
  embedder = new MockEmbedder(),
): Promise<SearchResult[]> {
  const db = await initStore();
  const [queryVec] = await embedder.embed([query]);
  if (!queryVec) {
    return [];
  }
  const result = await db.query<{
    content: string;
    metadata: Record<string, unknown>;
    score: number;
  }>(
    `SELECT content, metadata, 1 - (embedding <=> $1::vector) AS score
     FROM chunks
     WHERE embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorToSql(queryVec), topK],
  );

  return result.rows.map((row) => ({
    content: row.content,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    score: Number(row.score),
  }));
}

export async function bm25Search(query: string, topK: number): Promise<SearchResult[]> {
  const db = await initStore();
  const result = await db.query<{
    content: string;
    metadata: Record<string, unknown>;
    score: number;
  }>(
    `SELECT content, metadata,
            ts_rank(content_tsv, plainto_tsquery('english', $1)) AS score
     FROM chunks
     WHERE content_tsv @@ plainto_tsquery('english', $1)
     ORDER BY score DESC
     LIMIT $2`,
    [query, topK],
  );

  return result.rows.map((row) => ({
    content: row.content,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
    score: Number(row.score),
  }));
}

const RRF_K = 60;

export function reciprocalRankFusion(resultLists: SearchResult[][], topK: number): SearchResult[] {
  const scores = new Map<string, { result: SearchResult; score: number }>();

  for (const list of resultLists) {
    list.forEach((result, rank) => {
      const key = result.content;
      const rrfScore = 1 / (RRF_K + rank + 1);
      const existing = scores.get(key);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scores.set(key, { result, score: rrfScore });
      }
    });
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ result, score }) => ({ ...result, score }));
}

export async function search(
  query: string,
  topK: number,
  embedder = new MockEmbedder(),
): Promise<SearchResult[]> {
  const [vectorResults, bm25Results] = await Promise.all([
    vectorSearch(query, topK * 2, embedder),
    bm25Search(query, topK * 2),
  ]);
  return reciprocalRankFusion([vectorResults, bm25Results], topK);
}

export async function clearChunks(): Promise<void> {
  const db = await initStore();
  await db.exec("DELETE FROM chunks;");
}
