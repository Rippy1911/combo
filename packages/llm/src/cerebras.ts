import type { ChatRequest, LlmClient } from "./types.js";

// TODO(phase-c): implement
export function createCerebrasClient(): LlmClient {
  throw new Error("Cerebras provider not implemented");
}

export function cerebrasChat(_request: ChatRequest): AsyncIterable<never> {
  throw new Error("Cerebras provider not implemented");
}
