import { Button } from "@/components/ui/button";
import { loadMessages } from "@/lib/chatHistory";
import {
  VAULT_LABEL_OPENROUTER_MODEL,
  VAULT_LABEL_OPENROUTER_WORKER_MODEL,
  getVault,
} from "@/lib/vault";
import { useEffect, useState } from "react";
import { AgentPanel } from "./AgentPanel";
import { useComboStore } from "./store";

function FirstRun() {
  const setError = useComboStore((s) => s.setError);
  const error = useComboStore((s) => s.error);
  const [pass, setPass] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (pass.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }
    if (pass !== confirm) {
      setError("Passphrases don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await getVault().setPassphrase(pass);
      await enterUnlocked();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Combo</h1>
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Set a passphrase to create your local encrypted vault. It encrypts your API keys and is
        never sent anywhere.
      </p>
      <input
        data-testid="first-run-passphrase"
        type="password"
        placeholder="Passphrase (min 8 chars)"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      <input
        data-testid="first-run-confirm"
        type="password"
        placeholder="Confirm passphrase"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button data-testid="first-run-submit" onClick={() => void submit()} disabled={busy}>
        {busy ? "Creating vault..." : "Create vault"}
      </Button>
    </main>
  );
}

function UnlockView() {
  const error = useComboStore((s) => s.error);
  const setError = useComboStore((s) => s.setError);
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const ok = await getVault().unlock(pass);
      if (ok) {
        await enterUnlocked();
      } else {
        setError("Wrong passphrase.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Unlock Combo</h1>
      <p className="max-w-xs text-center text-sm text-muted-foreground">
        Enter your passphrase to unlock the vault.
      </p>
      <input
        data-testid="unlock-passphrase"
        type="password"
        placeholder="Passphrase"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
        }}
        className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button data-testid="unlock-submit" onClick={() => void submit()} disabled={busy}>
        {busy ? "Unlocking..." : "Unlock"}
      </Button>
    </main>
  );
}

async function enterUnlocked() {
  const vault = getVault();
  const store = useComboStore.getState();
  const storedModel = await vault.get(VAULT_LABEL_OPENROUTER_MODEL);
  if (storedModel) store.setModel(storedModel);
  const storedWorker = await vault.get(VAULT_LABEL_OPENROUTER_WORKER_MODEL);
  if (storedWorker) store.setWorkerModel(storedWorker);
  const messages = await loadMessages();
  store.setMessages(messages);
  store.setPhase("unlocked");
}

export function App() {
  const phase = useComboStore((s) => s.phase);

  useEffect(() => {
    void (async () => {
      const vault = getVault();
      const initialized = await vault.isInitialized();
      if (!initialized) {
        useComboStore.getState().setPhase("first-run");
        return;
      }
      if (vault.isUnlocked()) {
        await enterUnlocked();
      } else {
        useComboStore.getState().setPhase("locked");
      }
    })();
  }, []);

  if (phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading Combo...</p>
      </main>
    );
  }
  if (phase === "first-run") return <FirstRun />;
  if (phase === "locked") return <UnlockView />;
  return <AgentPanel />;
}
