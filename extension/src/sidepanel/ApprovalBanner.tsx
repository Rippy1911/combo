import { Button } from "@/components/ui/button";
import type { ToolChipData } from "./ToolChip";

export interface PendingApproval {
  tool: string;
  args?: Record<string, unknown>;
  toolCallId: string;
  resolve: (allow: boolean) => void;
}

export function ApprovalBanner({
  pending,
  onAutoSmart,
  onAutoAll,
}: {
  pending: PendingApproval | null;
  onAutoSmart: () => void;
  onAutoAll: () => void;
}) {
  if (!pending) return null;
  const chip: ToolChipData = { tool: pending.tool, args: pending.args, status: "running" };

  return (
    <div
      className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-2"
      data-testid="approval-banner"
    >
      <div className="mb-1.5 text-xs font-medium text-amber-700">Allow this action?</div>
      <div className="mb-2">
        <div className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px]">
          ⚙ {chip.tool}
          <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">
            {JSON.stringify(pending.args ?? {}, null, 2)}
          </pre>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => pending.resolve(true)} data-testid="approve-allow">
          Allow
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => pending.resolve(false)}
          data-testid="approve-deny"
        >
          Deny
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onAutoSmart}
          data-testid="approve-auto-smart"
          title="Let a cheap LLM decide for the rest of this session"
        >
          Auto (smart)
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onAutoAll}
          data-testid="approve-auto-all"
          title="Auto-approve everything this session"
        >
          Auto all
        </Button>
      </div>
    </div>
  );
}
