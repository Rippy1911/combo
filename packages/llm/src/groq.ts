import type { ChatRequest, LlmClient } from "./types.js";

// TODO(phase-c): implement
export function createGroqClient(): LlmClient {
  throw new Error("Groq provider not implemented");
}

export function groqChat(_request: ChatRequest): AsyncIterable<never> {
  throw new Error("Groq provider not implemented");
}
