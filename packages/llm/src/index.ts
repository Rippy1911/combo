import type { Message } from "@combo/shared";

/** BYOK LLM provider identifiers. Phase B ships OpenRouter only. */
export type LlmProvider =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  | "ollama"
  | "groq"
  | "cerebras";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

/** A single chat turn sent to a provider. */
export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Provider chat request — `chat({ model, messages, stream? })`. */
export interface LlmChatRequest {
  model: string;
  messages: LlmChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LlmUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface LlmChatResponse {
  content: string;
  model: string;
  usage?: LlmUsage;
}

/** Provider contract every BYOK client implements. */
export interface LlmProviderClient {
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
  stream(request: LlmChatRequest): AsyncIterable<string>;
  testConnection(): Promise<boolean>;
}

export const DEFAULT_LLM_PROVIDER: LlmProvider = "openrouter";
export const DEFAULT_OPENROUTER_MODEL = "openrouter/x-ai/grok-4.5-fast";

export function getDefaultLlmProvider(): LlmProvider {
  return DEFAULT_LLM_PROVIDER;
}

/** Map a @combo/shared Message to the provider chat-message shape. */
export function toChatMessage(message: Message): LlmChatMessage {
  return { role: message.role, content: message.content };
}

// ── Errors ────────────────────────────────────────────────────────────────

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export class LlmAuthError extends LlmError {
  constructor(message = "invalid API key (401)") {
    super(message, 401);
    this.name = "LlmAuthError";
  }
}

export class LlmRateLimitError extends LlmError {
  constructor(message = "rate limited (429)") {
    super(message, 429);
    this.name = "LlmRateLimitError";
  }
}

export class LlmServerError extends LlmError {
  constructor(status: number, message?: string) {
    super(message ?? `upstream server error (${status})`, status);
    this.name = "LlmServerError";
  }
}

export class LlmBadResponseError extends LlmError {
  constructor(message = "malformed provider response") {
    super(message);
    this.name = "LlmBadResponseError";
  }
}

export class LlmNetworkError extends LlmError {
  constructor(cause: unknown) {
    super(`network error: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "LlmNetworkError";
  }
}

export class ProviderNotImplementedError extends LlmError {
  constructor(provider: LlmProvider) {
    super(
      `${provider} provider is not implemented in Phase B (OpenRouter only). Track the remaining providers in a follow-up issue.`,
    );
    this.name = "ProviderNotImplementedError";
  }
}

/** Async iterable that rejects on the first `next()` — used by stub stream(). */
function rejectingAsyncIterable(error: Error): AsyncIterable<string> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(error),
      };
    },
  };
}

function mapStatusError(status: number, body: string): LlmError {
  if (status === 401 || status === 403) return new LlmAuthError(body || undefined);
  if (status === 429) return new LlmRateLimitError(body || undefined);
  if (status >= 500) return new LlmServerError(status, body || undefined);
  return new LlmError(`provider error (${status}): ${body}`, status);
}

/** True if a thrown error is worth retrying (rate limit, 5xx, or network). */
export function isRetryable(error: unknown): boolean {
  if (error instanceof LlmRateLimitError) return true;
  if (error instanceof LlmServerError) return true;
  if (error instanceof LlmNetworkError) return true;
  return false;
}

// ── SSE parsing ────────────────────────────────────────────────────────────

/**
 * Parse an OpenAI-compatible SSE text stream into content deltas.
 * Accepts an async iterable of raw (possibly partial) SSE text chunks.
 */
export async function* parseSse(chunks: AsyncIterable<string>): AsyncIterable<string> {
  let buffer = "";
  for await (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data.length === 0 || data === "[DONE]") {
        if (data === "[DONE]") return;
        continue;
      }
      let json: { choices?: Array<{ delta?: { content?: string } }> };
      try {
        json = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = json.choices?.[0]?.delta?.content;
      if (typeof delta === "string" && delta.length > 0) yield delta;
    }
  }
}

// ── Retry ──────────────────────────────────────────────────────────────────

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_RETRY: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

function backoffMs(attempt: number, opts: Required<RetryOptions>): number {
  const exp = opts.baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * opts.baseDelayMs;
  return Math.min(opts.maxDelayMs, exp + jitter);
}

/** Retry a fetch-style operation on retryable errors with exponential backoff. */
export async function withRetry<T>(
  run: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: Required<RetryOptions> = {
    maxRetries: options.maxRetries ?? DEFAULT_RETRY.maxRetries,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs,
    sleep: options.sleep ?? DEFAULT_RETRY.sleep,
  };
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= opts.maxRetries || !isRetryable(error)) throw error;
      await opts.sleep(backoffMs(attempt, opts));
      attempt += 1;
    }
  }
}

// ── OpenRouter provider ────────────────────────────────────────────────────

export interface OpenRouterProviderOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  retry?: Partial<RetryOptions>;
  referer?: string;
  title?: string;
}

export class OpenRouterProvider implements LlmProviderClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retry: Required<RetryOptions>;
  private readonly referer?: string;
  private readonly title?: string;

  constructor(options: OpenRouterProviderOptions) {
    if (!options.apiKey) throw new Error("OpenRouterProvider requires an apiKey");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.retry = {
      maxRetries: options.retry?.maxRetries ?? DEFAULT_RETRY.maxRetries,
      baseDelayMs: options.retry?.baseDelayMs ?? DEFAULT_RETRY.baseDelayMs,
      maxDelayMs: options.retry?.maxDelayMs ?? DEFAULT_RETRY.maxDelayMs,
      sleep: options.retry?.sleep ?? DEFAULT_RETRY.sleep,
    };
    this.referer = options.referer;
    this.title = options.title;
  }

  private headers(stream: boolean): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (stream) h.Accept = "text/event-stream";
    if (this.referer) h["HTTP-Referer"] = this.referer;
    if (this.title) h["X-Title"] = this.title;
    return h;
  }

  private body(req: LlmChatRequest): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      model: req.model,
      messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (req.temperature !== undefined) payload.temperature = req.temperature;
    if (req.maxTokens !== undefined) payload.max_tokens = req.maxTokens;
    return payload;
  }

  async testConnection(): Promise<boolean> {
    const res = await this.fetch(`${this.baseUrl}/models`, {
      method: "GET",
      headers: this.headers(false),
    });
    return res.ok;
  }

  /** fetch wrapper that converts non-Llm failures (e.g. TypeError) into LlmNetworkError. */
  private async fetch(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch (error) {
      throw error instanceof LlmError ? error : new LlmNetworkError(error);
    }
  }

  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    return withRetry(async () => {
      const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(false),
        body: JSON.stringify({ ...this.body(request), stream: false }),
      });
      if (!res.ok) throw mapStatusError(res.status, await safeText(res));
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new LlmBadResponseError();
      return {
        content,
        model: json.model ?? request.model,
        usage: mapUsage(json.usage),
      };
    }, this.retry);
  }

  async *stream(request: LlmChatRequest): AsyncIterable<string> {
    yield* withRetryStream(() => this.produceStream(request), this.retry);
  }

  private async *produceStream(request: LlmChatRequest): AsyncIterable<string> {
    const res = await this.fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ ...this.body(request), stream: true }),
    });
    if (!res.ok) throw mapStatusError(res.status, await safeText(res));
    if (!res.body) throw new LlmBadResponseError("response has no body");
    yield* parseSse(readBodyChunks(res.body));
  }
}

/** Read a fetch Response body as an async iterable of decoded text chunks. */
export async function* readBodyChunks(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    if (value) yield decoder.decode(value, { stream: true });
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function mapUsage(raw?: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}): LlmUsage | undefined {
  if (!raw) return undefined;
  return {
    promptTokens: raw.prompt_tokens,
    completionTokens: raw.completion_tokens,
    totalTokens: raw.total_tokens,
  };
}

/** Like withRetry but for async generators (re-invokes the producer on retry). */
async function* withRetryStream(
  produce: () => AsyncIterable<string>,
  opts: Required<RetryOptions>,
): AsyncIterable<string> {
  let attempt = 0;
  for (;;) {
    try {
      for await (const chunk of produce()) yield chunk;
      return;
    } catch (error) {
      if (attempt >= opts.maxRetries || !isRetryable(error)) throw error;
      await opts.sleep(backoffMs(attempt, opts));
      attempt += 1;
    }
  }
}

// ── Stub providers (Phase B ships OpenRouter only) ──────────────────────────
// The remaining providers are intentionally not implemented in Phase B. Each
// stub satisfies the LlmProviderClient contract so the UI can list/select
// them, but every call throws ProviderNotImplementedError. Track enabling
// each one in a follow-up issue rather than leaving TODO markers in code.

abstract class StubProvider implements LlmProviderClient {
  constructor(private readonly provider: LlmProvider) {}

  chat(_request: LlmChatRequest): Promise<LlmChatResponse> {
    return Promise.reject(new ProviderNotImplementedError(this.provider));
  }

  stream(_request: LlmChatRequest): AsyncIterable<string> {
    return rejectingAsyncIterable(new ProviderNotImplementedError(this.provider));
  }

  testConnection(): Promise<boolean> {
    return Promise.reject(new ProviderNotImplementedError(this.provider));
  }
}

export class OpenAIProvider extends StubProvider {
  constructor() {
    super("openai");
  }
}
export class AnthropicProvider extends StubProvider {
  constructor() {
    super("anthropic");
  }
}
export class OllamaProvider extends StubProvider {
  constructor() {
    super("ollama");
  }
}
export class GroqProvider extends StubProvider {
  constructor() {
    super("groq");
  }
}
export class CerebrasProvider extends StubProvider {
  constructor() {
    super("cerebras");
  }
}
export class GoogleProvider extends StubProvider {
  constructor() {
    super("google");
  }
}

/** Factory for the Phase B BYOK surface (OpenRouter only; others throw). */
export function createLlmProvider(config: LlmConfig): LlmProviderClient {
  switch (config.provider) {
    case "openrouter":
      return new OpenRouterProvider({ apiKey: config.apiKey });
    case "openai":
      return new OpenAIProvider();
    case "anthropic":
      return new AnthropicProvider();
    case "ollama":
      return new OllamaProvider();
    case "groq":
      return new GroqProvider();
    case "cerebras":
      return new CerebrasProvider();
    case "google":
      return new GoogleProvider();
    default:
      throw new LlmError(`unknown provider: ${String(config.provider)}`);
  }
}
