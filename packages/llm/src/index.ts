import type { Message } from "@combo/shared";

/** BYOK LLM provider identifiers. */
export type LlmProvider = "openrouter" | "openai" | "anthropic" | "google" | "ollama";

export interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  model: string;
}

export interface LlmCompletionRequest {
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}

/** LLM provider interface stub (OpenRouter first in Phase B). */
export interface LlmProviderClient {
  complete(request: LlmCompletionRequest): Promise<string>;
  stream(request: LlmCompletionRequest): AsyncIterable<string>;
}

export const DEFAULT_LLM_PROVIDER: LlmProvider = "openrouter";

export function getDefaultLlmProvider(): LlmProvider {
  return DEFAULT_LLM_PROVIDER;
}
