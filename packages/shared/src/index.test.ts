import { describe, expect, it } from "vitest";
import { COMBO_PROTOCOL_VERSION, MessageSchema, getProtocolVersion } from "./index.js";

describe("@combo/shared", () => {
  it("exports protocol version", () => {
    expect(getProtocolVersion()).toBe(COMBO_PROTOCOL_VERSION);
  });

  it("validates message schema", () => {
    const message = MessageSchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      role: "user",
      content: "hello",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(message.role).toBe("user");
  });
});
