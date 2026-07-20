export {
  type ChatMessage,
  type ChatChunk,
  type ChatRequest,
  type LlmClient,
  type LlmProvider,
  LlmError,
  AuthError,
  RateLimitError,
  ProviderError,
  NetworkError,
  DEFAULT_LLM_PROVIDER,
  getDefaultLlmProvider,
  mapHttpError,
} from "./types.js";

export { createOpenRouterClient, parseSseLines } from "./openrouter.js";
export { createAnthropicClient } from "./anthropic.js";
export { createOpenAIClient } from "./openai.js";
export { createOllamaClient } from "./ollama.js";
export { createGroqClient } from "./groq.js";
export { createCerebrasClient } from "./cerebras.js";

import { createOpenRouterClient } from "./openrouter.js";
import type { LlmClient } from "./types.js";

export function createLlmClient(provider: "openrouter", apiKey: string): LlmClient {
  if (provider !== "openrouter") {
    throw new Error(`Provider ${provider} not implemented in Phase B`);
  }
  return createOpenRouterClient({ apiKey });
}

export async function testConnection(apiKey: string): Promise<void> {
  const client = createOpenRouterClient({ apiKey });
  await client.testConnection();
}

export async function chat(
  apiKey: string,
  request: import("./types.js").ChatRequest,
): Promise<AsyncIterable<import("./types.js").ChatChunk>> {
  const client = createOpenRouterClient({ apiKey });
  return client.chat(request);
}
