import { Button } from "@/components/ui/button";
import { getProtocolVersion } from "@combo/shared";

export function App() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Combo is alive</h1>
      <p className="text-sm text-muted-foreground">Protocol v{getProtocolVersion()}</p>
      <Button variant="secondary" size="sm">
        shadcn/ui ready
      </Button>
    </main>
  );
}
