import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { useAppStore } from "../store";

function passphraseStrength(passphrase: string): string {
  if (passphrase.length < 8) return "Too short (min 8 characters)";
  const hasUpper = /[A-Z]/.test(passphrase);
  const hasLower = /[a-z]/.test(passphrase);
  const hasDigit = /\d/.test(passphrase);
  const score = [hasUpper, hasLower, hasDigit, passphrase.length >= 12].filter(Boolean).length;
  if (score >= 3) return "Strong";
  if (score >= 2) return "Fair — add mixed case and numbers";
  return "Weak — use mixed case, numbers, 12+ chars";
}

export function SetPassphrase() {
  const completePassphraseSetup = useAppStore((s) => s.completePassphraseSetup);
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hint = passphraseStrength(passphrase);
  const canSubmit = passphrase.length >= 8 && passphrase === confirm && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passphrase !== confirm) {
      setError("Passphrases do not match");
      return;
    }
    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await completePassphraseSetup(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set passphrase");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Create vault passphrase</h1>
      <p className="text-sm text-muted-foreground">
        This encrypts your API keys locally. Combo never sees your passphrase.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="space-y-2">
          <Label htmlFor="passphrase">Passphrase</Label>
          <Input
            id="passphrase"
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm passphrase</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={!canSubmit}>
          {loading ? "Setting up…" : "Create vault"}
        </Button>
      </form>
    </main>
  );
}
