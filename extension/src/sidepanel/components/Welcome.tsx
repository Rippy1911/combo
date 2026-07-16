import { Button } from "@/components/ui/button";
import { useAppStore } from "../store";

export function Welcome() {
  const goToSetPassphrase = useAppStore((s) => s.goToSetPassphrase);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Welcome to Combo</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Your local-first AI agent. Set a vault passphrase to encrypt your API keys on this device.
      </p>
      <Button onClick={goToSetPassphrase}>Get started</Button>
    </main>
  );
}
