import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useAppStore } from "../store";

export function UnlockDialog() {
  const attemptUnlock = useAppStore((s) => s.attemptUnlock);
  const unlockError = useAppStore((s) => s.unlockError);
  const setUnlockError = useAppStore((s) => s.setUnlockError);
  const [passphrase, setPassphrase] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setUnlockError(null);
    try {
      await attemptUnlock(passphrase);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Unlock vault</h1>
      <p className="text-sm text-muted-foreground">Enter your passphrase to access Combo.</p>
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="unlock-passphrase">Passphrase</Label>
          <Input
            id="unlock-passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </div>
        {unlockError && <p className="text-sm text-red-600">{unlockError}</p>}
        <Button type="submit" disabled={!passphrase || loading}>
          {loading ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </main>
  );
}

export function LockedScreen() {
  const phase = useAppStore((s) => s.phase);
  if (phase === "unlockDialog") {
    return <UnlockDialog />;
  }
  const setPhase = useAppStore.setState;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-xl font-semibold">Vault locked</h1>
      <Button onClick={() => setPhase({ phase: "unlockDialog" })}>Unlock</Button>
    </main>
  );
}
