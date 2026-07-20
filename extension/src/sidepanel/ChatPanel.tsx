import { Button } from "@/components/ui/button";
import { describeLlmError, streamChat } from "@/lib/chat";
import { clearMessages, newId, nowIso, saveMessage } from "@/lib/chatHistory";
import { cn } from "@/lib/utils";
import { VAULT_LABEL_OPENROUTER_KEY, VAULT_LABEL_OPENROUTER_MODEL, getVault } from "@/lib/vault";
import { type LlmProvider, OpenRouterProvider } from "@combo/llm";
import { Lock, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useComboStore } from "./store";

const PROVIDERS: Array<{ id: LlmProvider; label: string; enabled: boolean }> = [
  { id: "openrouter", label: "OpenRouter", enabled: true },
  { id: "openai", label: "OpenAI (Phase C)", enabled: false },
  { id: "anthropic", label: "Anthropic (Phase C)", enabled: false },
  { id: "ollama", label: "Ollama (Phase C)", enabled: false },
  { id: "groq", label: "Groq (Phase C)", enabled: false },
  { id: "cerebras", label: "Cerebras (Phase C)", enabled: false },
  { id: "google", label: "Google (Phase C)", enabled: false },
];

function ByokDialog({ onClose }: { onClose: () => void }) {
  const setModel = useComboStore((s) => s.setModel);
  const model = useComboStore((s) => s.model);
  const [provider] = useState<LlmProvider>("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  async function testConnection() {
    if (!apiKey) {
      setStatus("Enter an API key first.");
      return;
    }
    setTesting(true);
    setStatus(null);
    try {
      const probe = await new OpenRouterProvider({ apiKey }).probeConnection();
      setStatus(
        probe.ok
          ? `Connection OK (HTTP ${probe.status})`
          : `Connection failed (HTTP ${probe.status})`,
      );
    } catch (error) {
      setStatus(`Connection failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setTesting(false);
    }
  }

  async function save() {
    if (!apiKey) {
      setStatus("Enter an API key first.");
      return;
    }
    setSaving(true);
    try {
      const vault = getVault();
      await vault.put(VAULT_LABEL_OPENROUTER_KEY, apiKey);
      await vault.put(VAULT_LABEL_OPENROUTER_MODEL, model);
      setStatus("Saved.");
      onClose();
    } catch (error) {
      setStatus(`Save failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-lg">
        <h2 className="mb-3 text-lg font-semibold">Bring your own key</h2>
        <label htmlFor="byok-provider" className="mb-1 block text-xs text-muted-foreground">
          Provider
        </label>
        <select
          id="byok-provider"
          data-testid="byok-provider"
          value={provider}
          disabled
          className="mb-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.enabled}>
              {p.label}
            </option>
          ))}
        </select>
        <label htmlFor="byok-key-input" className="mb-1 block text-xs text-muted-foreground">
          OpenRouter API key
        </label>
        <input
          id="byok-key-input"
          data-testid="byok-key-input"
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-or-v1-..."
          className="mb-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
        />
        <label htmlFor="byok-model-input" className="mb-1 block text-xs text-muted-foreground">
          Default model
        </label>
        <input
          id="byok-model-input"
          data-testid="byok-model-input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mb-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono"
        />
        {status && (
          <p data-testid="byok-status" className="mb-3 text-xs text-muted-foreground">
            {status}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} data-testid="byok-cancel">
            Cancel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={testConnection}
            disabled={testing}
            data-testid="byok-test-connection"
          >
            {testing ? "Testing..." : "Test connection"}
          </Button>
          <Button size="sm" onClick={save} disabled={saving} data-testid="byok-save">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ChatPanel() {
  const messages = useComboStore((s) => s.messages);
  const model = useComboStore((s) => s.model);
  const streaming = useComboStore((s) => s.streaming);
  const error = useComboStore((s) => s.error);
  const appendMessage = useComboStore((s) => s.appendMessage);
  const appendDelta = useComboStore((s) => s.appendDelta);
  const removeMessage = useComboStore((s) => s.removeMessage);
  const setModel = useComboStore((s) => s.setModel);
  const setStreaming = useComboStore((s) => s.setStreaming);
  const setError = useComboStore((s) => s.setError);
  const setPhase = useComboStore((s) => s.setPhase);
  const setMessages = useComboStore((s) => s.setMessages);

  const [input, setInput] = useState("");
  const [byokOpen, setByokOpen] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const history = messages;
    const userMsg = { id: newId(), role: "user" as const, content: text, createdAt: nowIso() };
    appendMessage(userMsg);
    await saveMessage(userMsg);
    const assistantId = newId();
    const assistantMsg = {
      id: assistantId,
      role: "assistant" as const,
      content: "",
      createdAt: nowIso(),
    };
    appendMessage(assistantMsg);
    await saveMessage(assistantMsg);
    setInput("");
    setStreaming(true);
    setError(null);
    try {
      const full = await streamChat({ model, history, userText: text, onDelta: appendDelta });
      await saveMessage({ ...assistantMsg, content: full });
    } catch (e) {
      setError(describeLlmError(e));
      removeMessage(assistantId);
    } finally {
      setStreaming(false);
    }
  }

  async function lock() {
    await getVault().lock();
    setPhase("locked");
  }

  async function clearHistory() {
    await clearMessages();
    setMessages([]);
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h1 className="text-sm font-semibold">Combo</h1>
        <input
          data-testid="model-input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          onBlur={() => {
            void getVault().put(VAULT_LABEL_OPENROUTER_MODEL, model);
          }}
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs font-mono"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setByokOpen(true)}
          data-testid="byok-button"
        >
          <Plus className="h-3.5 w-3.5" /> BYOK
        </Button>
        <Button variant="outline" size="sm" onClick={lock} data-testid="lock-button">
          <Lock className="h-3.5 w-3.5" />
        </Button>
      </header>

      {error && (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-xs text-muted-foreground">
            Add an OpenRouter key via BYOK, then send a message.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((m) => (
              <li
                key={m.id}
                data-testid={m.role === "user" ? "message-user" : "message-assistant"}
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-md px-2.5 py-1.5 text-sm",
                  m.role === "user"
                    ? "self-end bg-primary text-primary-foreground"
                    : "self-start bg-secondary text-secondary-foreground",
                )}
              >
                {m.content || (m.role === "assistant" && streaming ? "..." : "")}
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-border p-2">
        <div className="flex items-end gap-2">
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
            placeholder="Message Combo..."
            rows={2}
            className="flex-1 resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          />
          <Button
            size="sm"
            onClick={() => void send()}
            disabled={streaming}
            data-testid="send-button"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void clearHistory()}
            data-testid="clear-button"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </footer>

      {byokOpen && <ByokDialog onClose={() => setByokOpen(false)} />}
    </main>
  );
}
