import { Button } from "@/components/ui/button";
import type { PreviewPayload } from "@combo/agents";
import { X } from "lucide-react";

export function PreviewPane({
  preview,
  onClose,
  onSendToViews,
}: {
  preview: PreviewPayload;
  onClose: () => void;
  onSendToViews?: (view: { title: string; rows: string[][] }) => void;
}) {
  const canSendToViews = preview.kind === "table" && !!preview.rows;
  return (
    <div className="absolute inset-0 z-30 flex flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{preview.title}</div>
          <div className="text-[11px] text-muted-foreground">
            {preview.kind}
            {preview.rows ? ` · ${preview.rows.length} rows` : ""}
            {preview.meta
              ? ` · ${Object.entries(preview.meta)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")}`
              : ""}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {canSendToViews && onSendToViews && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onSendToViews({
                  title: preview.title,
                  rows: [preview.headers ?? [], ...(preview.rows ?? [])],
                })
              }
            >
              Send to Views
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close preview">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {preview.kind === "table" && preview.rows && (
          <table className="w-full border-collapse text-[12px]">
            {preview.headers && preview.headers.length > 0 && (
              <thead>
                <tr>
                  {preview.headers.map((h) => (
                    <th
                      key={`ph-${h}`}
                      className="sticky top-0 border border-border bg-muted px-2 py-1 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {preview.rows.map((row) => (
                <tr key={`pr-${row.join("|")}`} className="even:bg-muted/30">
                  {row.map((cell) => (
                    <td key={`pc-${cell}`} className="border border-border px-2 py-1 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {preview.kind === "html" && preview.html !== undefined && (
          <iframe
            title={preview.title}
            srcDoc={preview.html}
            sandbox=""
            className="h-full min-h-[300px] w-full rounded border border-border bg-white"
          />
        )}

        {preview.kind === "text" && preview.text !== undefined && (
          <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed">
            {preview.text}
          </pre>
        )}

        {preview.kind === "image" && preview.src && (
          <img
            src={preview.src}
            alt={preview.title}
            className="max-w-full rounded border border-border"
          />
        )}
      </div>
    </div>
  );
}
