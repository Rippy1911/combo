import type {
  LlmChatMessage,
  LlmChatResponse,
  LlmProviderClient,
  LlmUsage,
  ToolCall,
} from "@combo/llm";
import type { ContentRequest, ContentResponse } from "@combo/shared";
import { SENSITIVE_TOOLS } from "@combo/shared";
import { AGENT_TOOLS, parseToolArguments, rowsToCsv, toolArgsToContentRequest } from "./tools.js";

export type ApprovalMode = "ask" | "auto_llm" | "auto_all";

export interface BrowserBridge {
  runContent(request: ContentRequest, tabId?: number): Promise<ContentResponse>;
  listTabs(): Promise<Array<{ id: number; title: string; url: string }>>;
  openTab(url: string, active?: boolean): Promise<{ id: number; url: string }>;
  activateTab(tabId: number): Promise<{ ok: boolean }>;
  navigate(url: string, tabId?: number): Promise<{ ok: boolean; url: string }>;
  goBack(tabId?: number): Promise<{ ok: boolean }>;
  closeTab(tabId: number): Promise<{ ok: boolean }>;
  downloadText(filename: string, text: string, mime?: string): Promise<{ ok: boolean }>;
}

export interface AgentEvent {
  type:
    | "status"
    | "tool_start"
    | "tool_result"
    | "tool_approval"
    | "assistant_delta"
    | "done"
    | "error"
    | "usage";
  message?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  usage?: Usage;
  toolCallId?: string;
  usageSource?: "orchestrator" | "worker" | "approval";
  resolve?: (allow: boolean) => void;
}

export interface AgentRunOptions {
  model: string;
  /** Cheap model for parse_data (and optional approval). */
  workerModel?: string;
  userMessage: string;
  history?: LlmChatMessage[];
  maxSteps?: number;
  signal?: AbortSignal;
  systemPrompt?: string;
  enabledTools?: string[];
  approvalMode?: ApprovalMode;
  approvalModel?: string;
  onEvent?: (event: AgentEvent) => void;
}

export interface AgentRunResult {
  messages: LlmChatMessage[];
  finalText: string;
  steps: number;
  usage: Usage;
  aborted: boolean;
  hitStepLimit: boolean;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

const DEFAULT_WORKER_MODEL = "openrouter/openai/gpt-4.1-mini";

const DEFAULT_SYSTEM = `You are Combo, a local-first browser agent (orchestrator).
You CAN open tabs (open_tab), navigate the current tab (navigate), go_back, and close_tab.
For interaction prefer get_interactive → click_index / type_index (Nanobrowser-style indices) over guessing CSS.
For catalogs/scrapes: scroll + query_all or scrape_tables, then parse_data (cheap worker LLM) to structure rows, then export_csv.
Rules:
- Prefer get_interactive or query_all over dumping huge get_page text into your own context.
- After click/navigate, wait briefly then re-read.
- Never invent page content — use tools.
- Be concise in the final answer.`;

const PARSE_SYSTEM = `You extract structured data from untrusted page text.
Reply with ONLY valid JSON: {"rows":[...],"notes":"optional short note"}.
rows must match the user's intent / schema_hint. No markdown fences.`;

const ZERO: Usage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
};

function toUsage(u: LlmUsage | undefined): Usage {
  return {
    promptTokens: u?.promptTokens ?? 0,
    completionTokens: u?.completionTokens ?? 0,
    totalTokens: u?.totalTokens ?? 0,
    estimatedCostUsd: u?.estimatedCostUsd ?? 0,
  };
}

function sumUsage(a: Usage, b: Usage): Usage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    estimatedCostUsd: a.estimatedCostUsd + b.estimatedCostUsd,
  };
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        /* fallthrough */
      }
    }
    return { rows: [], notes: "parse_failed", raw: body.slice(0, 500) };
  }
}

export class AgentLoop {
  constructor(
    private readonly llm: LlmProviderClient,
    private readonly browser: BrowserBridge,
  ) {}

  async run(options: AgentRunOptions): Promise<AgentRunResult> {
    const maxSteps = options.maxSteps ?? 32;
    const approvalMode = options.approvalMode ?? "ask";
    const workerModel = options.workerModel ?? DEFAULT_WORKER_MODEL;
    const emit = options.onEvent ?? (() => undefined);
    const messages: LlmChatMessage[] = [
      { role: "system", content: options.systemPrompt ?? DEFAULT_SYSTEM },
      ...(options.history ?? []),
      { role: "user", content: options.userMessage },
    ];

    let usage = ZERO;
    let steps = 0;
    let finalText = "";

    for (let step = 0; step < maxSteps; step += 1) {
      if (options.signal?.aborted) {
        emit({ type: "done", message: "aborted", usage });
        return { messages, finalText, steps, usage, aborted: true, hitStepLimit: false };
      }

      emit({ type: "status", message: `Working… turn ${step + 1} (limit ${maxSteps})` });

      const enabled = options.enabledTools;
      const tools =
        enabled && enabled.length > 0
          ? AGENT_TOOLS.filter((t) => enabled.includes(t.function.name))
          : AGENT_TOOLS;

      let result: LlmChatResponse;
      try {
        result = await this.llm.chatStream(
          {
            model: options.model,
            messages,
            tools: tools.length > 0 ? tools : undefined,
            temperature: 0.2,
          },
          (chunk) => emit({ type: "assistant_delta", message: chunk }),
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        emit({ type: "error", message: msg });
        throw error;
      }

      const stepUsage = toUsage(result.usage);
      usage = sumUsage(usage, stepUsage);
      emit({ type: "usage", usage: stepUsage, usageSource: "orchestrator" });
      steps += 1;

      const toolCalls = result.toolCalls ?? [];
      if (toolCalls.length === 0) {
        finalText = result.content ?? "";
        messages.push({ role: "assistant", content: finalText });
        emit({ type: "done", usage });
        return { messages, finalText, steps, usage, aborted: false, hitStepLimit: false };
      }

      messages.push({
        role: "assistant",
        content: result.content ?? "",
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        if (options.signal?.aborted) {
          emit({ type: "done", message: "aborted", usage });
          return { messages, finalText, steps, usage, aborted: true, hitStepLimit: false };
        }

        const args = parseToolArguments(call.function.arguments);
        const allowed = await this.approve(
          call,
          args,
          approvalMode,
          options.approvalModel ?? workerModel,
          emit,
          options.signal,
          (u) => {
            usage = sumUsage(usage, u);
          },
        );
        if (!allowed) {
          const denied = { ok: false, error: "denied by user / policy" };
          emit({
            type: "tool_result",
            tool: call.function.name,
            args,
            result: denied,
            toolCallId: call.id,
          });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: JSON.stringify(denied),
          });
          continue;
        }

        const toolResult = await this.executeTool(call, args, emit, workerModel, (u) => {
          usage = sumUsage(usage, u);
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.function.name,
          content: typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult),
        });
      }
    }

    finalText = `Hit the step limit (${maxSteps} model turns). Say “continue” or narrow the task.`;
    messages.push({ role: "assistant", content: finalText });
    emit({ type: "done", message: finalText, usage });
    return { messages, finalText, steps, usage, aborted: false, hitStepLimit: true };
  }

  private async approve(
    call: ToolCall,
    args: Record<string, unknown>,
    mode: ApprovalMode,
    approvalModel: string,
    emit: (e: AgentEvent) => void,
    signal: AbortSignal | undefined,
    onUsage: (u: Usage) => void,
  ): Promise<boolean> {
    if (!SENSITIVE_TOOLS.has(call.function.name)) return true;
    if (mode === "auto_all") return true;

    if (mode === "auto_llm") {
      try {
        const verdict = await this.llm.chatStream(
          {
            model: approvalModel,
            messages: [
              {
                role: "system",
                content:
                  "You are a safety gate for a browser agent. Reply ONLY yes or no. Approve routine browsing (open shop URLs, click nav/search, type search queries). Deny destructive/sensitive (delete, payments, password changes, email send, random downloads).",
              },
              {
                role: "user",
                content: `Tool: ${call.function.name}\nArgs: ${JSON.stringify(args)}`,
              },
            ],
            maxTokens: 4,
            temperature: 0,
          },
          () => undefined,
        );
        const u = toUsage(verdict.usage);
        onUsage(u);
        emit({ type: "usage", usage: u, usageSource: "approval" });
        return (verdict.content ?? "").trim().toLowerCase().startsWith("y");
      } catch {
        // fall through to ask
      }
    }

    return await new Promise<boolean>((resolve) => {
      if (signal?.aborted) {
        resolve(false);
        return;
      }
      const onAbort = () => resolve(false);
      signal?.addEventListener("abort", onAbort, { once: true });
      emit({
        type: "tool_approval",
        tool: call.function.name,
        args,
        toolCallId: call.id,
        message: `Allow ${call.function.name}?`,
        resolve: (allow) => {
          signal?.removeEventListener("abort", onAbort);
          resolve(allow);
        },
      });
    });
  }

  private async executeTool(
    call: ToolCall,
    args: Record<string, unknown>,
    emit: (e: AgentEvent) => void,
    workerModel: string,
    onUsage: (u: Usage) => void,
  ): Promise<unknown> {
    const name = call.function.name;
    emit({ type: "tool_start", tool: name, args, toolCallId: call.id });

    try {
      let result: unknown;

      if (name === "list_tabs") {
        result = { tabs: await this.browser.listTabs() };
      } else if (name === "open_tab") {
        result = await this.browser.openTab(String(args.url ?? ""), true);
      } else if (name === "activate_tab") {
        result = await this.browser.activateTab(Number(args.tabId));
      } else if (name === "navigate") {
        result = await this.browser.navigate(String(args.url ?? ""));
      } else if (name === "go_back") {
        result = await this.browser.goBack();
      } else if (name === "close_tab") {
        result = await this.browser.closeTab(Number(args.tabId));
      } else if (name === "parse_data") {
        result = await this.parseData(args, workerModel, emit, onUsage);
      } else if (name === "export_csv") {
        const filename = String(args.filename ?? "export.csv");
        const rows = Array.isArray(args.rows) ? (args.rows as unknown[]) : [];
        const csv = rowsToCsv(rows.map((r) => toRow(r)));
        result = await this.browser.downloadText(
          filename.endsWith(".csv") ? filename : `${filename}.csv`,
          csv,
          "text/csv",
        );
      } else {
        const req = toolArgsToContentRequest(name, args);
        if (!req) {
          result = { ok: false, error: `invalid args for ${name}` };
        } else {
          result = await this.browser.runContent(req);
        }
      }

      emit({ type: "tool_result", tool: name, args, result, toolCallId: call.id });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const result = { ok: false, error: msg };
      emit({ type: "tool_result", tool: name, args, result, toolCallId: call.id });
      return result;
    }
  }

  private async parseData(
    args: Record<string, unknown>,
    workerModel: string,
    emit: (e: AgentEvent) => void,
    onUsage: (u: Usage) => void,
  ): Promise<unknown> {
    const intent = String(args.intent ?? "");
    const schemaHint = args.schema_hint != null ? String(args.schema_hint) : "";
    let text = typeof args.text === "string" ? args.text : "";
    if (args.use_page || !text.trim()) {
      const page = await this.browser.runContent({ op: "get_page" });
      const data = page.data as { text?: string; title?: string; url?: string } | undefined;
      text = [data?.title, data?.url, data?.text].filter(Boolean).join("\n").slice(0, 14_000);
    }
    if (!text.trim()) return { ok: false, error: "no text to parse" };

    emit({ type: "status", message: `Worker parse (${workerModel})…` });
    const result = await this.llm.chatStream(
      {
        model: workerModel,
        messages: [
          { role: "system", content: PARSE_SYSTEM },
          {
            role: "user",
            content: `Intent: ${intent}\nSchema hint: ${schemaHint || "(infer reasonable columns)"}\n\n--- PAGE TEXT ---\n${text}`,
          },
        ],
        temperature: 0.1,
        maxTokens: 4096,
      },
      () => undefined,
    );
    const u = toUsage(result.usage);
    onUsage(u);
    emit({ type: "usage", usage: u, usageSource: "worker" });
    const parsed = parseJsonLoose(result.content ?? "{}");
    return { ok: true, model: workerModel, data: parsed };
  }
}

function toRow(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((c) => (c == null ? "" : String(c)));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map((c) => (c == null ? "" : String(c)));
  }
  return [String(value ?? "")];
}
