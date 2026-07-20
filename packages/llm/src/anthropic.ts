import type { ChatRequest, LlmClient } from "./types.js";

// TODO(phase-c): implement
export function createAnthropicClient(): LlmClient {
  throw new Error("Anthropic provider not implemented");
}

export function anthropicChat(_request: ChatRequest): AsyncIterable<never> {
  throw new Error("Anthropic provider not implemented");
}
