import { describe, expect, it } from "vitest";
import { getDefaultLlmProvider } from "./index.js";

describe("@combo/llm", () => {
  it("defaults to OpenRouter provider", () => {
    expect(getDefaultLlmProvider()).toBe("openrouter");
  });
});
