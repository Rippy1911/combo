import type { ChatRequest, LlmClient } from "./types.js";

// TODO(phase-c): implement
export function createOllamaClient(): LlmClient {
  throw new Error("Ollama provider not implemented");
}

export function ollamaChat(_request: ChatRequest): AsyncIterable<never> {
  throw new Error("Ollama provider not implemented");
}
