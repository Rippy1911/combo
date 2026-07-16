export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

const EMBEDDING_DIM = 384;

export async function hashToVector(text: string): Promise<number[]> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const hash = new Uint8Array(hashBuffer);
  const vector: number[] = [];
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const byte = hash[i % hash.length] ?? 0;
    vector.push(byte / 127.5 - 1);
  }
  return vector;
}

export class MockEmbedder implements Embedder {
  async embed(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => hashToVector(text)));
  }
}

export const EMBEDDING_DIMENSION = EMBEDDING_DIM;
