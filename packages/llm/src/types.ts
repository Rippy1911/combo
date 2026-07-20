export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  signal?: AbortSignal;
}

export class LlmError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export class AuthError extends LlmError {
  constructor(message = "Authentication failed") {
    super(message, 401);
    this.name = "AuthError";
  }
}

export class RateLimitError extends LlmError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429);
    this.name = "RateLimitError";
  }
}

export class ProviderError extends LlmError {
  constructor(message = "Provider error", statusCode = 500) {
    super(message, statusCode);
    this.name = "ProviderError";
  }
}

export class NetworkError extends LlmError {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

export type LlmProvider = "openrouter" | "openai" | "anthropic" | "ollama" | "groq" | "cerebras";

export const DEFAULT_LLM_PROVIDER: LlmProvider = "openrouter";

export function getDefaultLlmProvider(): LlmProvider {
  return DEFAULT_LLM_PROVIDER;
}

export interface LlmClient {
  chat(request: ChatRequest): AsyncIterable<ChatChunk>;
  testConnection(): Promise<void>;
}

export function mapHttpError(status: number, body: string): LlmError {
  if (status === 401) {
    return new AuthError(body || "Authentication failed");
  }
  if (status === 429) {
    return new RateLimitError(body || "Rate limit exceeded");
  }
  if (status >= 500 && status <= 599) {
    return new ProviderError(body || "Provider error", status);
  }
  return new LlmError(body || `HTTP ${status}`, status);
}
