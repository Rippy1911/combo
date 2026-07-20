import { z } from "zod";

/** Combo agent message schema (Phase A stub). */
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
