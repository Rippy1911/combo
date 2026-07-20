import type { ChatRequest, LlmClient } from "./types.js";

// TODO(phase-c): implement
export function createOpenAIClient(): LlmClient {
  throw new Error("OpenAI provider not implemented");
}

export function openaiChat(_request: ChatRequest): AsyncIterable<never> {
  throw new Error("OpenAI provider not implemented");
}
