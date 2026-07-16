import { Button } from "@/components/ui/button";
import { type Attachment, attachmentsToContext, parseAttachment } from "@/lib/attachments";
import { createChromeBridge } from "@/lib/chrome-bridge";
import {
  VAULT_LABEL_OPENROUTER_KEY,
  VAULT_LABEL_OPENROUTER_MODEL,
  VAULT_LABEL_OPENROUTER_WORKER_MODEL,
  getVault,
} from "@/lib/vault";
import { type AgentEvent, AgentLoop, type PreviewPayload, type Usage } from "@combo/agents";
import { OpenRouterProvider } from "@combo/llm";
import { Lock, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { ApprovalBanner } from "./ApprovalBanner";
import { ByokDialog } from "./ByokDialog";
import { Markdown } from "./Markdown";
import { PreviewPane } from "./PreviewPane";
import { ToolChip } from "./ToolChip";
import { type UiTurn, useComboStore } from "./store";

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random()}`;
}

function ApprovalModeSelect() {
  const mode = useComboStore((s) => s.approvalMode);
  const setMode = useComboStore((s) => s.setApprovalMode);
  return (
    <select
      data-testid="approval-mode"
      value={mode}
      onChange={(e) => setMode(e.target.value as typeof mode)}
      className="rounded-md border border-input bg-background px-1.5 py-1 text-[11px]"
      title="Approval mode for sensitive tools"
    >
      <option value="ask">Ask</option>
      <option value="auto_llm">Auto (smart)</option>
      <option value="auto_all">Auto all</option>
    </select>
  );
}

export function AgentPanel() {
  const model = useComboStore((s) => s.model);
  const workerModel = useComboStore((s) => s.workerModel);
  const turns = useComboStore((s) => s.turns);
  const busy = useComboStore((s) => s.agentBusy);
  const error = useComboStore((s) => s.error);
  const pending = useComboStore((s) => s.pendingApproval);
  const sessionUsage = useComboStore((s) => s.sessionUsage);
  const setModel = useComboStore((s) => s.setModel);
  const setWorkerModel = useComboStore((s) => s.setWorkerModel);
  const setAgentBusy = useComboStore((s) => s.setAgentBusy);
  const appendTurn = useComboStore((s) => s.appendTurn);
  const updateLastTurn = useComboStore((s) => s.updateLastTurn);
  const setPendingApproval = useComboStore((s) => s.setPendingApproval);
  const addUsage = useComboStore((s) => s.addUsage);
  const setError = useComboStore((s) => s.setError);
  const setPhase = useComboStore((s) => s.setPhase);
  const resetAgent = useComboStore((s) => s.resetAgent);

  const [input, setInput] = useState("");
  const [byokOpen, setByokOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    // placeholders so the UI shows them immediately
    const placeholders = files.map((f) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: f.name,
      kind: "unknown" as const,
      mime: f.type || "application/octet-stream",
      size: f.size,
      status: "parsing" as const,
    }));
    setAttachments((xs) => [...xs, ...placeholders]);
    const parsed = await Promise.all(files.map((f) => parseAttachment(f)));
    setAttachments((xs) => {
      let next = [...xs];
      for (const p of parsed) {
        const idx = next.findIndex((a) => a.name === p.name && a.status === "parsing");
        if (idx >= 0) next[idx] = p;
        else next = [...next, p];
      }
      return next;
    });
  }

  async function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || busy) return;
    const ctx = attachmentsToContext(attachments);
    const fullMessage = ctx ? `${text}\n\n${ctx}` : text;
    setInput("");
    setAttachments([]);
    setError(null);

    const vault = getVault();
    const apiKey = await vault.get(VAULT_LABEL_OPENROUTER_KEY);
    if (!apiKey) {
      setError("Add an OpenRouter API key via BYOK first.");
      return;
    }
    await vault.put(VAULT_LABEL_OPENROUTER_MODEL, model);
    await vault.put(VAULT_LABEL_OPENROUTER_WORKER_MODEL, workerModel);

    const displayText =
      attachments.length > 0 ? `${text}\n📎 ${attachments.length} attachment(s)` : text;
    appendTurn({ id: newId(), role: "user", content: displayText, chips: [] });
    const assistantId = newId();
    appendTurn({ id: assistantId, role: "assistant", content: "", chips: [] });
    setAgentBusy(true);

    const provider = new OpenRouterProvider({ apiKey });
    const bridge = createChromeBridge();
    const agent = new AgentLoop(provider, bridge);

    const onEvent = (e: AgentEvent) => {
      switch (e.type) {
        case "status":
          setStatusMsg(e.message ?? null);
          break;
        case "tool_start":
          updateLastTurn((t) => ({
            ...t,
            chips: [
              ...t.chips,
              { tool: e.tool ?? "?", args: e.args, status: "running", result: undefined },
            ],
          }));
          break;
        case "tool_result": {
          updateLastTurn((t) => ({
            ...t,
            chips: t.chips.map((c) =>
              c.tool === (e.tool ?? "?") && c.status === "running"
                ? {
                    ...c,
                    result: e.result,
                    status:
                      e.result != null &&
                      typeof e.result === "object" &&
                      "ok" in (e.result as Record<string, unknown>) &&
                      (e.result as { ok: unknown }).ok === false
                        ? "error"
                        : "ok",
                  }
                : c,
            ),
          }));
          break;
        }
        case "tool_approval":
          setPendingApproval({
            tool: e.tool ?? "?",
            args: e.args,
            toolCallId: e.toolCallId ?? "",
            resolve: (allow) => {
              setPendingApproval(null);
              e.resolve?.(allow);
            },
          });
          break;
        case "assistant_delta":
          updateLastTurn((t) => ({ ...t, content: t.content + (e.message ?? "") }));
          break;
        case "usage":
          if (e.usage) addUsage(e.usage as Usage);
          break;
        case "done":
          if (e.message) updateLastTurn((t) => ({ ...t, content: e.message ?? "" }));
          setStatusMsg(null);
          setAgentBusy(false);
          break;
        case "preview":
          if (e.preview) setPreview(e.preview);
          break;
        case "error":
          setError(e.message ?? "agent error");
          break;
      }
    };

    try {
      await agent.run({
        model,
        workerModel,
        userMessage: fullMessage,
        approvalMode: useComboStore.getState().approvalMode,
        onEvent,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setAgentBusy(false);
    }
  }

  function autoSmart() {
    useComboStore.getState().setApprovalMode("auto_llm");
    pending?.resolve(true);
  }
  function autoAll() {
    useComboStore.getState().setApprovalMode("auto_all");
    pending?.resolve(true);
  }

  async function lock() {
    await getVault().lock();
    setPhase("locked");
  }

  return (
    <main className="relative flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h1 className="text-sm font-semibold">Combo</h1>
        <input
          data-testid="model-input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Orchestrator model"
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-mono"
          title="Orchestrator model (action/scrape)"
        />
        <input
          data-testid="worker-model-input"
          type="text"
          value={workerModel}
          onChange={(e) => setWorkerModel(e.target.value)}
          placeholder="Worker model"
          className="w-32 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-mono"
          title="Cheap worker model for parse_data"
        />
        <ApprovalModeSelect />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setByokOpen(true)}
          data-testid="byok-button"
          title="Bring your own key"
        >
          <Plus className="h-3.5 w-3.5" /> BYOK
        </Button>
        <Button variant="outline" size="sm" onClick={lock} data-testid="lock-button">
          <Lock className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">
        <Plus className="h-3 w-3" />
        <span>tokens: {sessionUsage.totalTokens}</span>
        <span>· cost: ${sessionUsage.estimatedCostUsd.toFixed(4)}</span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto h-6 px-2 text-[11px]"
          onClick={resetAgent}
          data-testid="new-chat"
        >
          New chat
        </Button>
      </div>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <ApprovalBanner pending={pending} onAutoSmart={autoSmart} onAutoAll={autoAll} />

      {statusMsg && busy && (
        <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
          {statusMsg}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {turns.length === 0 ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Add an OpenRouter key via BYOK, then ask Combo to read or act on the active tab.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {turns.map((t) => (
              <TurnView
                key={t.id}
                turn={t}
                onPreview={(rows) =>
                  setPreview({
                    kind: "table",
                    title: rows.headers ? "Tool result" : "Tool result",
                    headers: rows.headers,
                    rows: rows.rows,
                  })
                }
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-border p-2">
        {attachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                att={a}
                onRemove={() => setAttachments((xs) => xs.filter((x) => x.id !== a.id))}
                onPreview={(p) => setPreview(p)}
              />
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/*,.pdf,.txt,.csv,.tsv,.xlsx,.md,.json,.log"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
            data-testid="file-input"
          />
          <textarea
            data-testid="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message Combo…"
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            title="Attach files (images, pdf, txt, csv, xlsx)"
            data-testid="attach-button"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" onClick={() => void send()} disabled={busy} data-testid="send-button">
            <Send className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={resetAgent} data-testid="clear-button">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </footer>

      {byokOpen && <ByokDialog onClose={() => setByokOpen(false)} />}
      {preview && <PreviewPane preview={preview} onClose={() => setPreview(null)} />}
    </main>
  );
}

function TurnView({
  turn,
  onPreview,
}: {
  turn: UiTurn;
  onPreview?: (rows: { headers?: string[]; rows: string[][] }) => void;
}) {
  if (turn.role === "user") {
    return (
      <li className="self-end max-w-[85%] whitespace-pre-wrap rounded-md bg-primary px-2.5 py-1.5 text-sm text-primary-foreground">
        {turn.content}
      </li>
    );
  }
  return (
    <li className="self-start max-w-[92%]">
      {turn.content && (
        <div className="rounded-md bg-secondary px-2.5 py-1.5 text-sm text-secondary-foreground">
          <Markdown text={turn.content} />
        </div>
      )}
      {turn.chips.map((c, i) => (
        <ToolChip key={`${c.tool}-${i}`} chip={c} onPreview={onPreview} />
      ))}
      {turn.usage && (
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          tokens: {turn.usage.totalTokens}
        </div>
      )}
    </li>
  );
}

function previewForAttachment(att: Attachment): PreviewPayload | null {
  if (att.status !== "ready") return null;
  if (att.kind === "image" && att.dataUrl) {
    return {
      kind: "image",
      title: att.name,
      src: att.dataUrl,
      meta: { size: `${Math.round(att.size / 1024)} KB` },
    };
  }
  if ((att.kind === "csv" || att.kind === "xlsx") && att.rows && att.rows.length > 0) {
    return { kind: "table", title: att.name, rows: att.rows };
  }
  if (att.text) {
    return { kind: "text", title: att.name, text: att.text };
  }
  return null;
}

function AttachmentChip({
  att,
  onRemove,
  onPreview,
}: {
  att: Attachment;
  onRemove: () => void;
  onPreview: (p: PreviewPayload) => void;
}) {
  const preview = previewForAttachment(att);
  const icon =
    att.kind === "image"
      ? "🖼"
      : att.kind === "pdf"
        ? "📄"
        : att.kind === "xlsx"
          ? "📊"
          : att.kind === "csv"
            ? "📋"
            : "📎";
  return (
    <div
      className="flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-1 text-[11px]"
      data-testid="attachment-chip"
    >
      <span className="text-muted-foreground">{icon}</span>
      {preview ? (
        <button
          type="button"
          onClick={() => onPreview(preview)}
          className="max-w-[140px] truncate text-foreground hover:underline"
          title={`Preview ${att.name}`}
        >
          {att.name}
        </button>
      ) : (
        <span className="max-w-[140px] truncate text-foreground" title={att.name}>
          {att.name}
        </span>
      )}
      <span className="text-[10px] text-muted-foreground">
        {att.status === "parsing"
          ? "…"
          : att.status === "error"
            ? "⚠"
            : `${Math.round(att.size / 1024)} KB`}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${att.name}`}
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
