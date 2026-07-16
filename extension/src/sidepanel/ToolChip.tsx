import { Eye } from "lucide-react";
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

/** Extract a previewable {headers?, rows} from a chip's result/args, or null. */
export function previewableRows(
  chip: ToolChipData,
): { headers?: string[]; rows: string[][] } | null {
  const name = chip.tool;
  const r = chip.result as Record<string, unknown> | undefined;
  if (name === "parse_data" && r && Array.isArray(r.rows)) {
    return { rows: (r.rows as unknown[]).map(toStrRow) };
  }
  if (name === "scrape_tables" && r && Array.isArray(r.tables)) {
    const tables = r.tables as unknown[];
    if (tables.length === 0) return null;
    const first = (tables[0] as unknown[]).map(toStrRow);
    return { rows: first };
  }
  if (name === "query_all" && r && Array.isArray(r.items)) {
    const items = r.items as Array<Record<string, unknown>>;
    if (items.length === 0) return null;
    const headers = ["text", "selector", ...Object.keys(items[0].attrs ?? {})];
    const rows = items.map((it) => [
      String(it.text ?? ""),
      String(it.selector ?? ""),
      ...Object.values(it.attrs ?? {}).map(String),
    ]);
    return { headers, rows };
  }
  if (name === "export_csv" && chip.args && Array.isArray(chip.args.rows)) {
    return { rows: (chip.args.rows as unknown[]).map(toStrRow) };
  }
  return null;
}

function toStrRow(r: unknown): string[] {
  return Array.isArray(r) ? r.map((c) => String(c ?? "")) : [String(r ?? "")];
}

export function ToolChip({
  chip,
  onPreview,
}: {
  chip: ToolChipData;
  onPreview?: (rows: { headers?: string[]; rows: string[][] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const status = chip.status ?? "running";
  const previewable = onPreview ? previewableRows(chip) : null;

  return (
    <div className="my-1 rounded-md border border-border bg-muted/40 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
        data-testid="chip-head"
      >
        <span className="font-mono text-[11px] text-foreground">⚙ {chip.tool}</span>
        {previewable && (
          // biome-ignore lint/a11y/useSemanticElements: a nested <button> inside the chip-head <button> is invalid HTML
          <span
            role="button"
            tabIndex={0}
            className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-600 hover:bg-blue-500/25"
            onClick={(e) => {
              e.stopPropagation();
              onPreview?.(previewable);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onPreview?.(previewable);
              }
            }}
            aria-label={`Preview ${chip.tool} rows`}
            data-testid="chip-preview"
          >
            <Eye className="h-3 w-3" /> {previewable.rows.length}
          </span>
        )}
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
