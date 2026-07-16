import type { Message } from "@combo/shared";
import { describe, expect, it, vi } from "vitest";
import {
  AnthropicProvider,
  DEFAULT_OPENROUTER_MODEL,
  LlmAuthError,
  LlmBadResponseError,
  LlmError,
  LlmNetworkError,
  type LlmProvider,
  LlmRateLimitError,
  LlmServerError,
  OpenAIProvider,
  OpenRouterProvider,
  ProviderNotImplementedError,
  createLlmProvider,
  getDefaultLlmProvider,
  isRetryable,
  parseSse,
  toChatMessage,
  withRetry,
} from "./index.js";

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status, headers: { "Content-Type": "text/event-stream" } });
}

function instantSleep() {
  return () => Promise.resolve();
}

function msg(role: "user" | "assistant" | "system", content: string): Message {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    role,
    content,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("@combo/llm constants", () => {
  it("defaults to OpenRouter provider", () => {
    expect(getDefaultLlmProvider()).toBe("openrouter");
  });

  it("maps a shared Message to a chat message", () => {
    expect(toChatMessage(msg("user", "hi"))).toEqual({ role: "user", content: "hi" });
  });
});

describe("@combo/llm isRetryable", () => {
  it("retries rate-limit, server, and network errors", () => {
    expect(isRetryable(new LlmRateLimitError())).toBe(true);
    expect(isRetryable(new LlmServerError(503))).toBe(true);
    expect(isRetryable(new LlmNetworkError(new Error("x")))).toBe(true);
  });

  it("does not retry auth errors", () => {
    expect(isRetryable(new LlmAuthError())).toBe(false);
  });
});

describe("@combo/llm withRetry", () => {
  it("retries a failing call until it succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new LlmServerError(503);
        return "ok";
      },
      { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 2, sleep: instantSleep() },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new LlmAuthError();
        },
        { maxRetries: 5, baseDelayMs: 1, maxDelayMs: 2, sleep: instantSleep() },
      ),
    ).rejects.toBeInstanceOf(LlmAuthError);
    expect(calls).toBe(1);
  });
});

describe("@combo/llm parseSse", () => {
  it("parses content deltas and stops at [DONE]", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
      "data: [DONE]\n\n",
    ];
    const out: string[] = [];
    for await (const d of parseSse(asyncIter(chunks))) out.push(d);
    expect(out).toEqual(["hel", "lo"]);
  });

  it("ignores keepalive comments and partial JSON lines across chunks", async () => {
    const chunks = [
      ": keepalive\n\n",
      'data: {"choices":[{"delta":{"content":"wo',
      'rld"}}]}\n\ndata: [DONE]\n\n',
    ];
    const out: string[] = [];
    for await (const d of parseSse(asyncIter(chunks))) out.push(d);
    expect(out).toEqual(["world"]);
  });
});

describe("@combo/llm OpenRouterProvider", () => {
  it("chat sends the correct request shape and parses the response", async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: "pong" } }],
        model: "openrouter/x-ai/grok-4.5-fast",
        usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
      }),
    );
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-v1-test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { sleep: instantSleep() },
    });

    const res = await provider.chat({
      model: DEFAULT_OPENROUTER_MODEL,
      messages: [{ role: "user", content: "ping" }],
      temperature: 0.2,
      maxTokens: 16,
    });

    expect(res.content).toBe("pong");
    expect(res.usage?.totalTokens).toBe(5);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-or-v1-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(DEFAULT_OPENROUTER_MODEL);
    expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
    expect(body.temperature).toBe(0.2);
    expect(body.max_tokens).toBe(16);
    expect(body.stream).toBe(false);
  });

  it("stream yields content deltas", async () => {
    const fetchMock: FetchMock = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-v1-test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { sleep: instantSleep() },
    });

    const out: string[] = [];
    for await (const d of provider.stream({
      model: DEFAULT_OPENROUTER_MODEL,
      messages: [{ role: "user", content: "ping" }],
    })) {
      out.push(d);
    }
    expect(out.join("")).toBe("hello");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
  });

  it("rate limit retry works (429 then 200)", async () => {
    const fetchMock: FetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) return new Response("rate limited", { status: 429 });
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    });
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-v1-test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 2, sleep: instantSleep() },
    });

    const res = await provider.chat({
      model: DEFAULT_OPENROUTER_MODEL,
      messages: [{ role: "user", content: "ping" }],
    });
    expect(res.content).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps 401 to LlmAuthError without retry", async () => {
    const fetchMock: FetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-v1-fake",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { maxRetries: 3, sleep: instantSleep() },
    });
    await expect(
      provider.chat({
        model: DEFAULT_OPENROUTER_MODEL,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toBeInstanceOf(LlmAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps 500 to LlmServerError and retries up to the limit", async () => {
    const fetchMock: FetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-v1-test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 2, sleep: instantSleep() },
    });
    await expect(
      provider.chat({
        model: DEFAULT_OPENROUTER_MODEL,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toBeInstanceOf(LlmServerError);
    // 1 initial attempt + 2 retries
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps a network failure to LlmNetworkError and retries", async () => {
    const fetchMock: FetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-v1-test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { maxRetries: 1, baseDelayMs: 1, maxDelayMs: 2, sleep: instantSleep() },
    });
    await expect(
      provider.chat({
        model: DEFAULT_OPENROUTER_MODEL,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toBeInstanceOf(LlmNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws LlmBadResponseError when choices are missing", async () => {
    const fetchMock: FetchMock = vi.fn(async () => jsonResponse({ choices: [] }));
    const provider = new OpenRouterProvider({
      apiKey: "sk-or-v1-test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { sleep: instantSleep() },
    });
    await expect(
      provider.chat({
        model: DEFAULT_OPENROUTER_MODEL,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toBeInstanceOf(LlmBadResponseError);
  });

  it("testConnection returns true on 200 and false on 401", async () => {
    const ok: FetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    const p1 = new OpenRouterProvider({
      apiKey: "k",
      fetchImpl: ok as unknown as typeof fetch,
      retry: { sleep: instantSleep() },
    });
    expect(await p1.testConnection()).toBe(true);

    const bad: FetchMock = vi.fn(async () => new Response("nope", { status: 401 }));
    const p2 = new OpenRouterProvider({
      apiKey: "k",
      fetchImpl: bad as unknown as typeof fetch,
      retry: { sleep: instantSleep() },
    });
    expect(await p2.testConnection()).toBe(false);
  });

  it("requires an apiKey", () => {
    expect(() => new OpenRouterProvider({ apiKey: "" })).toThrow();
  });
});

describe("@combo/llm error mapping", () => {
  it("maps 403 to LlmAuthError", async () => {
    const fetchMock: FetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }));
    const provider = new OpenRouterProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { sleep: instantSleep() },
    });
    await expect(
      provider.chat({
        model: DEFAULT_OPENROUTER_MODEL,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toBeInstanceOf(LlmAuthError);
  });

  it("maps 400 to a generic non-retryable LlmError", async () => {
    const fetchMock: FetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    const provider = new OpenRouterProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retry: { maxRetries: 3, sleep: instantSleep() },
    });
    await expect(
      provider.chat({
        model: DEFAULT_OPENROUTER_MODEL,
        messages: [{ role: "user", content: "x" }],
      }),
    ).rejects.toBeInstanceOf(LlmError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("isRetryable is false for a generic LlmError", () => {
    expect(isRetryable(new LlmError("x", 400))).toBe(false);
  });
});

describe("@combo/llm stub providers", () => {
  it("OpenAI stub throws ProviderNotImplementedError", async () => {
    const p = new OpenAIProvider();
    await expect(p.chat({ model: "x", messages: [] })).rejects.toBeInstanceOf(
      ProviderNotImplementedError,
    );
    await expect(p.testConnection()).rejects.toBeInstanceOf(ProviderNotImplementedError);
  });

  it("Anthropic stub stream throws ProviderNotImplementedError", async () => {
    const p = new AnthropicProvider();
    await expect(async () => {
      for await (const _ of p.stream({ model: "x", messages: [] })) void _;
    }).rejects.toBeInstanceOf(ProviderNotImplementedError);
  });

  it("createLlmProvider returns OpenRouter for openrouter config", () => {
    expect(createLlmProvider({ provider: "openrouter", apiKey: "k", model: "m" })).toBeInstanceOf(
      OpenRouterProvider,
    );
  });

  it("createLlmProvider returns a stub for ollama", async () => {
    const p = createLlmProvider({ provider: "ollama", apiKey: "k", model: "m" });
    await expect(p.testConnection()).rejects.toBeInstanceOf(ProviderNotImplementedError);
  });

  it("createLlmProvider covers every stub provider branch", async () => {
    const stubs: LlmProvider[] = ["openai", "anthropic", "groq", "cerebras", "google"];
    for (const provider of stubs) {
      const p = createLlmProvider({ provider, apiKey: "k", model: "m" });
      await expect(p.testConnection()).rejects.toBeInstanceOf(ProviderNotImplementedError);
      await expect(p.chat({ model: "m", messages: [] })).rejects.toBeInstanceOf(
        ProviderNotImplementedError,
      );
    }
  });

  it("createLlmProvider throws on an unknown provider", () => {
    expect(() =>
      createLlmProvider({ provider: "unknown" as LlmProvider, apiKey: "k", model: "m" }),
    ).toThrow(LlmError);
  });
});

async function* asyncIter(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c;
}
