import type { PGlite } from "@electric-sql/pglite";

/** RAG chunk representation. */
export interface RagChunk {
  id: string;
  documentId: string;
  content: string;
  embedding?: number[];
  metadata: Record<string, string>;
}

/** Embedder contract; Phase B ships a deterministic mock. */
export interface Embedder {
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** RAG store contract. */
export interface RagStore {
  index(chunks: RagChunk[]): Promise<void>;
  search(query: string, limit?: number): Promise<RagChunk[]>;
}

export const RAG_ENGINE = "pglite-pgvector" as const;
export const RAG_DEFAULT_DIMENSIONS = 384;
export const RAG_DEFAULT_CHUNK_SIZE = 500;
export const RAG_DEFAULT_OVERLAP = 50;

export function getRagEngine(): typeof RAG_ENGINE {
  return RAG_ENGINE;
}

/** Deterministic 384-dim mock embedder (hash-based fake vectors). */
export class MockEmbedder implements Embedder {
  readonly dimensions = RAG_DEFAULT_DIMENSIONS;

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => mockVector(t, this.dimensions));
  }
}

/**
 * Deterministic hash-based vector: each text maps to a stable 384-dim vector.
 * Repeated tokens reinforce the same dimensions, so semantically similar
 * text (sharing tokens) lands closer together — enough to exercise cosine
 * search without a real embedding model.
 */
export function mockVector(text: string, dimensions = RAG_DEFAULT_DIMENSIONS): number[] {
  const vec = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = (h >>> 0) % dimensions;
    vec[idx] += 1;
  }
  // L2-normalize so cosine == dot product.
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dimensions; i++) vec[i] /= norm;
  return vec;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error(`dimension mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ── Chunker ────────────────────────────────────────────────────────────────

const SEPARATORS = ["\n\n\n", "\n\n", "\n", ". ", "? ", "! ", " ", ""];

function splitRecursive(text: string, max: number, separators: string[], depth: number): string[] {
  if (text.length <= max || depth >= separators.length) {
    return [text];
  }
  const sep = separators[depth];
  if (sep === "") {
    // Char fallback: hard-split by code units.
    const out: string[] = [];
    for (let i = 0; i < text.length; i += max) out.push(text.slice(i, i + max));
    return out;
  }
  const parts = text.split(sep);
  if (parts.length <= 1) {
    return splitRecursive(text, max, separators, depth + 1);
  }
  // Recursively split each part with finer separators first.
  const splitParts: string[] = [];
  for (const part of parts) {
    if (part.length === 0) continue;
    splitParts.push(...splitRecursive(part, max, separators, depth + 1));
  }
  // Greedily merge adjacent parts back together while ≤ max.
  const merged: string[] = [];
  let cur = "";
  for (const part of splitParts) {
    const candidate = cur ? cur + sep + part : part;
    if (candidate.length > max && cur) {
      merged.push(cur);
      cur = part;
    } else {
      cur = candidate;
    }
  }
  if (cur) merged.push(cur);
  return merged;
}

/** Recursive character text splitter (500 chars / 50 overlap by default). */
export function chunkText(
  text: string,
  options: { maxChunkSize?: number; overlap?: number } = {},
): string[] {
  const max = options.maxChunkSize ?? RAG_DEFAULT_CHUNK_SIZE;
  const overlap = options.overlap ?? RAG_DEFAULT_OVERLAP;
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  const raw = splitRecursive(trimmed, max, SEPARATORS, 0);
  const chunks = raw.filter((c) => c.length > 0);
  return applyOverlap(chunks, overlap, max);
}

function applyOverlap(chunks: string[], overlap: number, max: number): string[] {
  if (overlap <= 0 || chunks.length <= 1) return chunks;
  const result = [chunks[0]];
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1];
    const tailLen = Math.min(overlap, prev.length);
    const tail = prev.slice(prev.length - tailLen);
    const combined = tail + chunks[i];
    // Keep the chunk near the budget even after prepending the overlap.
    result.push(combined.length > max + overlap ? combined.slice(0, max + overlap) : combined);
  }
  return result;
}

// ── pglite-backed store ────────────────────────────────────────────────────

export interface RagStoreOptions {
  embedder?: Embedder;
  dimensions?: number;
}

/**
 * pglite + pgvector-backed chunk store.
 *
 * NOTE: pglite 0.5.x does not bundle the pgvector extension, so embeddings are
 * persisted as `float4[]` and cosine ranking is performed in TypeScript. The
 * `RagStore` contract is unchanged, so pgvector (loaded via pglite's tarball
 * extension mechanism) can replace the ranking path in Phase C when the real
 * embedder lands.
 */
export class PgliteRagStore implements RagStore {
  private readonly pg: PGlite;
  private readonly embedder: Embedder;
  private initialized = false;

  constructor(pg: PGlite, options: RagStoreOptions = {}) {
    this.pg = pg;
    this.embedder = options.embedder ?? new MockEmbedder();
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    // Best-effort: enable pgvector if the extension is available (future pglite
    // builds). The store works without it via float4[] + TS cosine ranking.
    try {
      await this.pg.exec("CREATE EXTENSION IF NOT EXISTS vector;");
    } catch {
      // pgvector not bundled in this pglite build — continue without it.
    }
    await this.pg.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id text PRIMARY KEY,
        document_id text NOT NULL,
        content text NOT NULL,
        embedding float4[] NOT NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    this.initialized = true;
  }

  async index(chunks: RagChunk[]): Promise<void> {
    await this.init();
    if (chunks.length === 0) return;
    const texts = chunks.map((c) => c.content);
    const embeddings = chunks.map((c) => c.embedding ?? this.embedder.embed([c.content]));
    const resolved = await Promise.all(embeddings.map((e) => Promise.resolve(e)));
    // embed() takes a batch; fall back to per-chunk only when callers pre-set embeddings.
    let vectors = resolved;
    if (chunks.every((c) => c.embedding === undefined)) {
      vectors = await this.embedder.embed(texts);
    }
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const meta = JSON.stringify(c.metadata);
      await this.pg.query(
        `INSERT INTO chunks (id, document_id, content, embedding, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content,
           embedding = EXCLUDED.embedding, metadata = EXCLUDED.metadata;`,
        [c.id, c.documentId, c.content, vectors[i], meta],
      );
    }
  }

  async search(query: string, limit = 3): Promise<RagChunk[]> {
    await this.init();
    const queryVec = (await this.embedder.embed([query]))[0];
    const { rows } = (await this.pg.query(
      "SELECT id, document_id, content, metadata, embedding FROM chunks;",
    )) as {
      rows: Array<{
        id: string;
        document_id: string;
        content: string;
        metadata: Record<string, string>;
        embedding: number[];
      }>;
    };
    return rows
      .map((r) => ({
        chunk: r,
        score: cosineSimilarity(queryVec, r.embedding ?? []),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ chunk }) => ({
        id: chunk.id,
        documentId: chunk.document_id,
        content: chunk.content,
        metadata: chunk.metadata ?? {},
      }));
  }

  async close(): Promise<void> {
    if (this.pg.close) await this.pg.close();
  }
}
