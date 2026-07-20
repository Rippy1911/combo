import { useEffect } from "react";
import { Chat } from "./components/Chat";
import { SetPassphrase } from "./components/SetPassphrase";
import { LockedScreen } from "./components/UnlockDialog";
import { Welcome } from "./components/Welcome";
import { useAppStore } from "./store";

export function App() {
  const phase = useAppStore((s) => s.phase);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (phase === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (phase === "welcome") {
    return <Welcome />;
  }

  if (phase === "setPassphrase") {
    return <SetPassphrase />;
  }

  if (phase === "locked" || phase === "unlockDialog") {
    return <LockedScreen />;
  }

  return <Chat />;
}
