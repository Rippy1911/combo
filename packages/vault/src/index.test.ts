import { describe, expect, it } from "vitest";
import { VaultEntrySchema, getVaultAlgorithm } from "./index.js";

describe("@combo/vault", () => {
  it("exports vault algorithm constant", () => {
    expect(getVaultAlgorithm()).toBe("AES-GCM");
  });

  it("validates vault entry schema", () => {
    const entry = VaultEntrySchema.parse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      label: "openrouter-key",
      encryptedValue: "base64...",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(entry.label).toBe("openrouter-key");
  });
});
