import { Button } from "@/components/ui/button";
import {
  VAULT_LABEL_OPENROUTER_KEY,
  VAULT_LABEL_OPENROUTER_MODEL,
  VAULT_LABEL_OPENROUTER_WORKER_MODEL,
  getVault,
} from "@/lib/vault";
import { type LlmProvider, OpenRouterProvider } from "@combo/llm";
import { useState } from "react";
import { useComboStore } from "./store";

const PROVIDERS: Array<{ id: LlmProvider; label: string; enabled: boolean }> = [
  { id: "openrouter", label: "OpenRouter", enabled: true },
  { id: "openai", label: "OpenAI (Phase D)", enabled: false },
  { id: "anthropic", label: "Anthropic (Phase D)", enabled: false },
  { id: "ollama", label: "Ollama (Phase D)", enabled: false },
  { id: "groq", label: "Groq (Phase D)", enabled: false },
  { id: "cerebras", label: "Cerebras (Phase D)", enabled: false },
  { id: "google", label: "Google (Phase D)", enabled: false },
];

export function ByokDialog({ onClose }: { onClose: () => void }) {
  const model = useComboStore((s) => s.model);
  const workerModel = useComboStore((s) => s.workerModel);
  const setModel = useComboStore((s) => s.setModel);
  const setWorkerModel = useComboStore((s) => s.setWorkerModel);
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
      await vault.put(VAULT_LABEL_OPENROUTER_WORKER_MODEL, workerModel);
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
          Orchestrator model
        </label>
        <input
          id="byok-model-input"
          data-testid="byok-model-input"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="mb-3 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm font-mono"
        />
        <label htmlFor="byok-worker-input" className="mb-1 block text-xs text-muted-foreground">
          Worker model (cheap, for parse_data)
        </label>
        <input
          id="byok-worker-input"
          data-testid="byok-worker-input"
          type="text"
          value={workerModel}
          onChange={(e) => setWorkerModel(e.target.value)}
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
