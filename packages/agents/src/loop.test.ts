import type { LlmChatResponse, LlmProviderClient, ToolCall } from "@combo/llm";
import { describe, expect, it, vi } from "vitest";
import type { BrowserBridge } from "./loop.js";
import { AgentLoop } from "./loop.js";

function mockLlm(
  sequence: Array<{
    content: string | null;
    toolCalls?: Array<{ id: string; name: string; args: string }>;
    model?: string;
  }>,
  onChat?: (model: string) => void,
): LlmProviderClient {
  let i = 0;
  return {
    chatStream: vi.fn(
      async (
        opts: { model: string },
        onDelta: (chunk: string) => void,
      ): Promise<LlmChatResponse> => {
        onChat?.(opts.model);
        const step = sequence[i] ?? sequence[sequence.length - 1];
        if (!step) throw new Error("mock sequence exhausted");
        i += 1;
        const toolCalls: ToolCall[] | undefined = step.toolCalls?.map((t) => ({
          id: t.id,
          type: "function" as const,
          function: { name: t.name, arguments: t.args },
        }));
        const content = step.content ?? "";
        if (content) onDelta(content);
        return {
          content,
          model: step.model ?? opts.model,
          toolCalls,
          finishReason: toolCalls?.length ? "tool_calls" : "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    ),
    stream: vi.fn(),
    testConnection: vi.fn(async () => true),
  } as unknown as LlmProviderClient;
}

function stubBrowser(overrides: Partial<BrowserBridge> = {}): BrowserBridge {
  return {
    runContent: vi.fn(async () => ({
      ok: true,
      data: { title: "Example", url: "https://example.com", text: "Hello EAN 590123" },
    })),
    listTabs: vi.fn(async () => []),
    openTab: vi.fn(async (url: string) => ({ id: 1, url })),
    activateTab: vi.fn(async () => ({ ok: true })),
    navigate: vi.fn(async (url: string) => ({ ok: true, url })),
    goBack: vi.fn(async () => ({ ok: true })),
    closeTab: vi.fn(async () => ({ ok: true })),
    downloadText: vi.fn(async () => ({ ok: true })),
    ...overrides,
  };
}

describe("AgentLoop", () => {
  it("runs get_page then answers", async () => {
    const llm = mockLlm([
      { content: null, toolCalls: [{ id: "1", name: "get_page", args: "{}" }] },
      { content: "The page title is Example." },
    ]);
    const browser = stubBrowser();
    const agent = new AgentLoop(llm, browser);
    const events: string[] = [];
    const result = await agent.run({
      model: "mock-orch",
      userMessage: "What is this page?",
      onEvent: (e) => events.push(e.type),
    });

    expect(result.finalText).toContain("Example");
    expect(result.aborted).toBe(false);
    expect(result.hitStepLimit).toBe(false);
    expect(result.steps).toBe(2);
    expect(browser.runContent).toHaveBeenCalled();
    expect(events).toContain("tool_start");
    expect(events).toContain("done");
  });

  it("parse_data uses the worker model", async () => {
    const models: string[] = [];
    const llm = mockLlm(
      [
        {
          content: null,
          toolCalls: [
            {
              id: "1",
              name: "parse_data",
              args: JSON.stringify({ intent: "extract EANs", text: "Product A EAN 123" }),
            },
          ],
        },
        { content: JSON.stringify({ rows: [{ name: "Product A", ean: "123" }], notes: "ok" }) },
        { content: "Found 1 product." },
      ],
      (m) => models.push(m),
    );
    const agent = new AgentLoop(llm, stubBrowser());
    const result = await agent.run({
      model: "orch-model",
      workerModel: "worker-model",
      userMessage: "parse",
    });
    expect(result.finalText).toMatch(/product/i);
    expect(models).toContain("orch-model");
    expect(models).toContain("worker-model");
  });

  it("can navigate via bridge (auto_all approval)", async () => {
    const llm = mockLlm([
      {
        content: null,
        toolCalls: [
          { id: "1", name: "navigate", args: JSON.stringify({ url: "https://allegro.pl" }) },
        ],
      },
      { content: "Navigated." },
    ]);
    const browser = stubBrowser();
    const agent = new AgentLoop(llm, browser);
    await agent.run({ model: "mock", userMessage: "go", approvalMode: "auto_all" });
    expect(browser.navigate).toHaveBeenCalledWith("https://allegro.pl");
  });

  it("export_csv downloads rows as csv", async () => {
    const llm = mockLlm([
      {
        content: null,
        toolCalls: [
          {
            id: "1",
            name: "export_csv",
            args: JSON.stringify({
              filename: "out",
              rows: [
                ["a", "b"],
                ["c,d", "e"],
              ],
            }),
          },
        ],
      },
      { content: "Downloaded." },
    ]);
    const browser = stubBrowser();
    const agent = new AgentLoop(llm, browser);
    await agent.run({ model: "mock", userMessage: "export", approvalMode: "auto_all" });
    expect(browser.downloadText).toHaveBeenCalled();
    const call = (browser.downloadText as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("out.csv");
    expect(call[1]).toContain("a,b");
    expect(call[1]).toContain('"c,d",e');
  });

  it("streams the final answer via assistant_delta chunks", async () => {
    const llm = mockLlm([
      {
        content: null,
        toolCalls: [{ id: "1", name: "get_page", args: "{}" }],
      },
      { content: "Hello world" },
    ]);
    const events: { type: string; message?: string }[] = [];
    const agent = new AgentLoop(llm, stubBrowser());
    const result = await agent.run({
      model: "mock",
      userMessage: "read",
      onEvent: (e) => events.push({ type: e.type, message: e.message }),
    });
    const deltas = events.filter((e) => e.type === "assistant_delta");
    expect(deltas.length).toBeGreaterThan(0);
    expect(deltas.map((d) => d.message ?? "").join("")).toBe("Hello world");
    expect(result.finalText).toBe("Hello world");
  });

  it("open_preview emits a preview event with the table payload", async () => {
    const llm = mockLlm([
      {
        content: null,
        toolCalls: [
          {
            id: "1",
            name: "open_preview",
            args: JSON.stringify({
              kind: "table",
              title: "Piadina",
              rows: [
                ["name", "ean"],
                ["Piadina", "123"],
              ],
            }),
          },
        ],
      },
      { content: "Opened the preview." },
    ]);
    const events: { type: string; preview?: { kind: string; title: string; rows?: string[][] } }[] =
      [];
    const agent = new AgentLoop(llm, stubBrowser());
    await agent.run({
      model: "mock",
      userMessage: "show me",
      approvalMode: "auto_all",
      onEvent: (e) => events.push({ type: e.type, preview: e.preview as never }),
    });
    const previews = events.filter((e) => e.type === "preview");
    expect(previews.length).toBe(1);
    expect(previews[0].preview?.kind).toBe("table");
    expect(previews[0].preview?.title).toBe("Piadina");
    expect(previews[0].preview?.rows?.[1]).toEqual(["Piadina", "123"]);
  });
});
