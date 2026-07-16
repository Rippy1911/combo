import { describe, expect, it, vi } from "vitest";
import {
  createAnthropicClient,
  createCerebrasClient,
  createGroqClient,
  createLlmClient,
  createOllamaClient,
  createOpenAIClient,
  getDefaultLlmProvider,
  testConnection,
} from "./index.js";

describe("@combo/llm index", () => {
  it("exports default provider", () => {
    expect(getDefaultLlmProvider()).toBe("openrouter");
  });

  it("creates OpenRouter client via factory", () => {
    const client = createLlmClient("openrouter", "test-key");
    expect(client.chat).toBeTypeOf("function");
    expect(client.testConnection).toBeTypeOf("function");
  });

  it("exposes stub provider factories", () => {
    expect(() => createAnthropicClient()).toThrow(/not implemented/);
    expect(() => createOpenAIClient()).toThrow(/not implemented/);
    expect(() => createOllamaClient()).toThrow(/not implemented/);
    expect(() => createGroqClient()).toThrow(/not implemented/);
    expect(() => createCerebrasClient()).toThrow(/not implemented/);
  });

  it("testConnection hits OpenRouter auth key endpoint", async () => {
    const fetchFn = vi.fn().mockImplementation((url: string) => {
      expect(url).toContain("/auth/key");
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchFn);
    await testConnection("key");
    expect(fetchFn).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
