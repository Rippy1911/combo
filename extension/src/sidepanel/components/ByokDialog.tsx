import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { put } from "@combo/vault";
import { useCallback, useEffect, useState } from "react";
import { onPortMessage, sendPortMessage } from "../store";

interface ByokDialogProps {
  open: boolean;
  onClose: () => void;
}

type TestStatus = "idle" | "testing" | "success" | "error";

export function ByokDialog({ open, onClose }: ByokDialogProps) {
  const [provider, setProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const runTest = useCallback(() => {
    if (!apiKey) return;
    setTestStatus("testing");
    setTestError(null);

    const requestId = crypto.randomUUID();
    const cleanup = onPortMessage((msg) => {
      if (msg.type !== "combo:test-connection-result" || msg.requestId !== requestId) {
        return;
      }
      cleanup();
      if (msg.ok) {
        setTestStatus("success");
        setTestError(null);
      } else {
        setTestStatus("error");
        setTestError(msg.error ?? `Error ${msg.statusCode ?? ""}`);
      }
    });

    sendPortMessage({
      type: "combo:test-connection",
      requestId,
      apiKey,
    });
  }, [apiKey]);

  useEffect(() => {
    if (!open) {
      setTestStatus("idle");
      setTestError(null);
    }
  }, [open]);

  const handleSave = async () => {
    if (!apiKey || provider !== "openrouter") return;
    setSaving(true);
    try {
      await put("openrouter-api-key", apiKey);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Bring your own key</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Store your LLM API key in the encrypted vault.
        </p>

        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select id="provider" value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="openrouter">OpenRouter</option>
              <option value="openai" disabled>
                OpenAI (coming soon)
              </option>
              <option value="anthropic" disabled>
                Anthropic (coming soon)
              </option>
              <option value="ollama" disabled>
                Ollama (coming soon)
              </option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">API key</Label>
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestStatus("idle");
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={runTest}
              disabled={!apiKey || testStatus === "testing"}
            >
              {testStatus === "testing" ? "Testing…" : "Test Connection"}
            </Button>
            {testStatus === "success" && (
              <span className="text-sm text-green-600">✓ Connected</span>
            )}
            {testStatus === "error" && <span className="text-sm text-red-600">✗ {testError}</span>}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={!apiKey || saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}
