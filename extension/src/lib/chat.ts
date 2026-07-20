import {
  LlmAuthError,
  type LlmChatMessage,
  LlmError,
  LlmNetworkError,
  LlmRateLimitError,
  LlmServerError,
  createLlmProvider,
  toChatMessage,
} from "@combo/llm";
import type { Message } from "@combo/shared";
import { VAULT_LABEL_OPENROUTER_KEY, getVault } from "./vault";

const SYSTEM_PROMPT =
  "You are Combo, a local-first, BYOK assistant running in a browser side panel. Reply concisely.";

/**
 * Stream a chat completion from OpenRouter using the BYOK key stored in the
 * vault. `history` is the conversation before the new user turn. Deltas are
 * surfaced via `onDelta` as they arrive; the full assistant text is returned.
 */
export async function streamChat(options: {
  model: string;
  history: Message[];
  userText: string;
  onDelta: (delta: string) => void;
}): Promise<string> {
  const vault = getVault();
  const key = await vault.get(VAULT_LABEL_OPENROUTER_KEY);
  if (!key) {
    throw new Error("No OpenRouter API key saved. Open BYOK to add one.");
  }
  const provider = createLlmProvider({
    provider: "openrouter",
    apiKey: key,
    model: options.model,
  });
  const messages: LlmChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...options.history.map(toChatMessage),
    { role: "user", content: options.userText },
  ];
  let content = "";
  for await (const delta of provider.stream({ model: options.model, messages })) {
    content += delta;
    options.onDelta(delta);
  }
  return content;
}

/** Map an LLM error to a user-facing message. */
export function describeLlmError(error: unknown): string {
  if (error instanceof LlmAuthError)
    return `OpenRouter rejected the key (HTTP ${error.status ?? 401}).`;
  if (error instanceof LlmRateLimitError)
    return "Rate limited by OpenRouter (HTTP 429). Retry shortly.";
  if (error instanceof LlmServerError) return `OpenRouter server error (HTTP ${error.status}).`;
  if (error instanceof LlmNetworkError) return "Network error reaching OpenRouter.";
  if (error instanceof LlmError)
    return `LLM error${error.status ? ` (HTTP ${error.status})` : ""}: ${error.message}`;
  return error instanceof Error ? error.message : String(error);
}
