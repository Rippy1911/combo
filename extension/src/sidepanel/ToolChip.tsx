import { useState } from "react";

export interface ToolChipData {
  tool: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: "running" | "ok" | "error" | "denied";
}

const STATUS_COLOR: Record<NonNullable<ToolChipData["status"]>, string> = {
  running: "bg-blue-500/15 text-blue-600",
  ok: "bg-emerald-500/15 text-emerald-600",
  error: "bg-destructive/15 text-destructive",
  denied: "bg-amber-500/15 text-amber-700",
};

export function ToolChip({ chip }: { chip: ToolChipData }) {
  const [open, setOpen] = useState(false);
  const status = chip.status ?? "running";

  return (
    <div className="my-1 rounded-md border border-border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
        data-testid="chip-head"
      >
        <span className="font-mono text-[11px] text-foreground">⚙ {chip.tool}</span>
        <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${STATUS_COLOR[status]}`}>
          {status}
        </span>
        <span className="text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-2 py-1.5 font-mono text-[11px]">
          <div className="text-muted-foreground">args</div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-foreground">
            {JSON.stringify(chip.args ?? {}, null, 2)}
          </pre>
          {chip.result !== undefined && (
            <>
              <div className="mt-1 text-muted-foreground">result</div>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-foreground">
                {typeof chip.result === "string"
                  ? chip.result
                  : JSON.stringify(chip.result, null, 2)}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
