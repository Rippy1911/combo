import { z } from "zod";

/** Combo agent message schema. */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type Message = z.infer<typeof MessageSchema>;

/** Protocol version for extension ↔ offscreen communication. */
export const COMBO_PROTOCOL_VERSION = "0.1.0" as const;

export function getProtocolVersion(): typeof COMBO_PROTOCOL_VERSION {
  return COMBO_PROTOCOL_VERSION;
}

/** Chat models available in Phase B. */
export const PHASE_B_MODELS = [
  "x-ai/grok-4.5-fast",
  "x-ai/grok-4.5",
  "anthropic/claude-sonnet-4.6",
  "openai/gpt-5.5",
  "z-ai/glm-5.2",
] as const;

export type PhaseBModel = (typeof PHASE_B_MODELS)[number];

/** Offscreen messaging protocol. */
export interface ChatStartMessage {
  type: "combo:chat-start";
  requestId: string;
  model: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  apiKey: string;
}

export interface ChatAbortMessage {
  type: "combo:chat-abort";
  requestId: string;
}

export interface ChatChunkMessage {
  type: "combo:chat-chunk";
  requestId: string;
  content: string;
  done: boolean;
}

export interface ChatErrorMessage {
  type: "combo:chat-error";
  requestId: string;
  error: string;
  statusCode?: number;
}

export interface TestConnectionMessage {
  type: "combo:test-connection";
  requestId: string;
  apiKey: string;
}

export interface TestConnectionResultMessage {
  type: "combo:test-connection-result";
  requestId: string;
  ok: boolean;
  error?: string;
  statusCode?: number;
}

export type OffscreenPortMessage =
  | ChatStartMessage
  | ChatAbortMessage
  | ChatChunkMessage
  | ChatErrorMessage
  | TestConnectionMessage
  | TestConnectionResultMessage;
