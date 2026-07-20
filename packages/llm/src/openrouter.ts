const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const REFERER = "https://github.com/Rippy1911/combo";
const TITLE = "Combo";
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30000;

import { type ChatChunk, type ChatRequest, NetworkError, mapHttpError } from "./types.js";

export interface OpenRouterConfig {
  apiKey: string;
  fetch?: typeof fetch;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function backoffDelay(attempt: number): number {
  const delay = BASE_BACKOFF_MS * 2 ** attempt;
  return Math.min(delay, MAX_BACKOFF_MS);
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": REFERER,
    "X-Title": TITLE,
  };
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
): Promise<Response> {
  const signal = init.signal ?? undefined;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetchFn(url, init);
      if (response.status === 429 && attempt < MAX_RETRIES - 1) {
        await sleep(backoffDelay(attempt), signal);
        continue;
      }
      return response;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(backoffDelay(attempt), signal);
      }
    }
  }

  throw new NetworkError(lastError?.message ?? "Network request failed");
}

export function parseSseLines(buffer: string): { chunks: ChatChunk[]; remainder: string } {
  const chunks: ChatChunk[] = [];
  const lines = buffer.split("\n");
  const remainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data:")) {
      continue;
    }
    const data = trimmed.slice(5).trim();
    if (data === "[DONE]") {
      chunks.push({ content: "", done: true });
      continue;
    }
    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{ delta?: { content?: string } }>;
      };
      const content = parsed.choices?.[0]?.delta?.content ?? "";
      if (content) {
        chunks.push({ content, done: false });
      }
    } catch {
      // partial JSON line — wait for more data
    }
  }

  return { chunks, remainder };
}

export async function* streamChatResponse(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncIterable<ChatChunk> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const { chunks, remainder } = parseSseLines(buffer);
      buffer = remainder;
      for (const chunk of chunks) {
        yield chunk;
        if (chunk.done) {
          return;
        }
      }
    }
    if (buffer.trim()) {
      const { chunks } = parseSseLines(`${buffer}\n`);
      for (const chunk of chunks) {
        yield chunk;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function createOpenRouterClient(config: OpenRouterConfig) {
  const fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async *chat(request: ChatRequest): AsyncIterable<ChatChunk> {
      const response = await fetchWithRetry(
        `${OPENROUTER_BASE}/chat/completions`,
        {
          method: "POST",
          headers: buildHeaders(config.apiKey),
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            stream: request.stream ?? true,
          }),
          signal: request.signal,
        },
        fetchFn,
      );

      if (!response.ok) {
        const body = await response.text();
        throw mapHttpError(response.status, body);
      }

      if (!response.body) {
        throw new NetworkError("Empty response body");
      }

      yield* streamChatResponse(response.body, request.signal);
    },

    async testConnection(): Promise<void> {
      const response = await fetchWithRetry(
        `${OPENROUTER_BASE}/auth/key`,
        {
          method: "GET",
          headers: buildHeaders(config.apiKey),
        },
        fetchFn,
      );

      if (!response.ok) {
        const body = await response.text();
        throw mapHttpError(response.status, body);
      }
    },
  };
}

export { OPENROUTER_BASE, REFERER, TITLE, MAX_RETRIES, BASE_BACKOFF_MS };
