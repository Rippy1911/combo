import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterClient, parseSseLines, streamChatResponse } from "./openrouter.js";
import { AuthError, NetworkError, ProviderError, RateLimitError, mapHttpError } from "./types.js";

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url, init));
  }) as unknown as typeof fetch;
}

function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("mapHttpError", () => {
  it("maps 401 to AuthError", () => {
    expect(mapHttpError(401, "unauthorized")).toBeInstanceOf(AuthError);
  });
  it("maps 429 to RateLimitError", () => {
    expect(mapHttpError(429, "slow down")).toBeInstanceOf(RateLimitError);
  });
  it("maps 500-599 to ProviderError", () => {
    expect(mapHttpError(503, "down")).toBeInstanceOf(ProviderError);
  });
});

describe("parseSseLines", () => {
  it("parses multiple chunks and [DONE]", () => {
    const input =
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n' +
      'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
      "data: [DONE]\n\n";
    const { chunks } = parseSseLines(input);
    expect(chunks).toEqual([
      { content: "Hello", done: false },
      { content: " world", done: false },
      { content: "", done: true },
    ]);
  });

  it("handles empty lines and partial JSON", () => {
    const { chunks, remainder } = parseSseLines('data: {"choices":[{"del');
    expect(chunks).toHaveLength(0);
    expect(remainder).toBe('data: {"choices":[{"del');
  });
});

describe("createOpenRouterClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("sends correct chat request shape", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const fetchFn = mockFetch((_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return sseResponse(['data: {"choices":[{"delta":{"content":"Hi"}}]}\n', "data: [DONE]\n\n"]);
    });

    const client = createOpenRouterClient({ apiKey: "test-key", fetch: fetchFn });
    const chunks: string[] = [];
    for await (const chunk of client.chat({
      model: "openai/gpt-4",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    })) {
      if (chunk.content) {
        chunks.push(chunk.content);
      }
    }

    expect(capturedBody).toEqual({
      model: "openai/gpt-4",
      messages: [{ role: "user", content: "hello" }],
      stream: true,
    });
    expect(chunks.join("")).toBe("Hi");
    const headers = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["HTTP-Referer"]).toBe("https://github.com/Rippy1911/combo");
    expect(headers["X-Title"]).toBe("Combo");
  });

  it("retries on 429 with backoff", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const fetchFn = mockFetch(() => {
      calls++;
      if (calls < 3) {
        return new Response("rate limited", { status: 429 });
      }
      return sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n', "data: [DONE]\n\n"]);
    });

    const client = createOpenRouterClient({ apiKey: "key", fetch: fetchFn });
    const promise = (async () => {
      const result: string[] = [];
      for await (const chunk of client.chat({
        model: "m",
        messages: [{ role: "user", content: "x" }],
      })) {
        if (chunk.content) {
          result.push(chunk.content);
        }
      }
      return result;
    })();

    await vi.runAllTimersAsync();
    const result = await promise;
    expect(calls).toBe(3);
    expect(result).toEqual(["ok"]);
  });

  it("maps error status codes to typed errors", async () => {
    vi.useFakeTimers();
    for (const { status, name } of [
      { status: 401, name: "AuthError" },
      { status: 500, name: "ProviderError" },
    ]) {
      const fetchFn = mockFetch(() => new Response("err", { status }));
      const client = createOpenRouterClient({ apiKey: "key", fetch: fetchFn });
      const expectation = expect(
        (async () => {
          for await (const _chunk of client.chat({
            model: "m",
            messages: [{ role: "user", content: "x" }],
          })) {
            // consume
          }
        })(),
      ).rejects.toMatchObject({ name });
      await vi.runAllTimersAsync();
      await expectation;
    }
    vi.useRealTimers();
  });

  it("maps 429 to RateLimitError after retries", async () => {
    vi.useFakeTimers();
    const fetchFn = mockFetch(() => new Response("slow", { status: 429 }));
    const client = createOpenRouterClient({ apiKey: "key", fetch: fetchFn });
    const expectation = expect(
      (async () => {
        for await (const _chunk of client.chat({
          model: "m",
          messages: [{ role: "user", content: "x" }],
        })) {
          // consume
        }
      })(),
    ).rejects.toMatchObject({ name: "RateLimitError" });
    await vi.runAllTimersAsync();
    await expectation;
    vi.useRealTimers();
  });

  it("propagates abort signal", async () => {
    const controller = new AbortController();
    const fetchFn = mockFetch((_url, init) => {
      expect(init?.signal).toBe(controller.signal);
      return sseResponse([]);
    });
    const client = createOpenRouterClient({ apiKey: "key", fetch: fetchFn });
    controller.abort();
    await expect(async () => {
      for await (const _chunk of client.chat({
        model: "m",
        messages: [{ role: "user", content: "x" }],
        signal: controller.signal,
      })) {
        // consume
      }
    }).rejects.toThrow();
  });

  it("testConnection hits auth key endpoint", async () => {
    const fetchFn = mockFetch((url) => {
      expect(url).toContain("/auth/key");
      return new Response("{}", { status: 200 });
    });
    const client = createOpenRouterClient({ apiKey: "key", fetch: fetchFn });
    await client.testConnection();
  });

  it("throws NetworkError on fetch failure after retries", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("network down"));
    const client = createOpenRouterClient({ apiKey: "key", fetch: fetchFn as typeof fetch });
    const promise = client.testConnection();
    const expectation = expect(promise).rejects.toBeInstanceOf(NetworkError);
    await vi.runAllTimersAsync();
    await expectation;
    vi.useRealTimers();
  });
});

describe("streamChatResponse", () => {
  it("streams partial lines across reads", async () => {
    const part1 = 'data: {"choices":[{"delta":{"content":"A"}}]}\n\n';
    const part2 = 'data: {"choices":[{"delta":{"content":"B"}}]}\n\ndata: [DONE]\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(part1));
        controller.enqueue(encoder.encode(part2));
        controller.close();
      },
    });

    const chunks: string[] = [];
    for await (const chunk of streamChatResponse(stream)) {
      if (chunk.content) {
        chunks.push(chunk.content);
      }
    }
    expect(chunks).toEqual(["A", "B"]);
  });
});
