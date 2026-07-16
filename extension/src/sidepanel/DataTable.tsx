import { useMemo, useState } from "react";

export function DataTable({
  rows,
  title,
  onExport,
  onSaveView,
}: {
  rows: string[][];
  title: string;
  onExport: (filename: string, text: string, mime: string) => void | Promise<void>;
  onSaveView?: (name: string, rows: string[][]) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [asc, setAsc] = useState(true);

  if (rows.length === 0) return <p className="text-xs text-muted-foreground">Empty table.</p>;

  const header = rows[0];
  const body = rows.slice(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return body;
    return body.filter((r) => r.some((c) => c.toLowerCase().includes(q)));
  }, [body, query]);

  const sorted = useMemo(() => {
    if (sortCol == null) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      const an = Number(av);
      const bn = Number(bv);
      if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "")
        return asc ? an - bn : bn - an;
      return asc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return copy;
  }, [filtered, sortCol, asc]);

  const toggleSort = (i: number) => {
    if (sortCol === i) setAsc((v) => !v);
    else {
      setSortCol(i);
      setAsc(true);
    }
  };

  const exportCsv = () => {
    const csv = [header, ...sorted]
      .map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
      .join("\n");
    onExport(`${title.replace(/\s+/g, "_")}.csv`, csv, "text/csv");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter rows…"
          className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
        />
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        >
          Export CSV
        </button>
        {onSaveView && (
          <button
            type="button"
            onClick={() => onSaveView(title, [header, ...sorted])}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
          >
            Save view
          </button>
        )}
      </div>
      <div className="text-[11px] text-muted-foreground">{sorted.length} rows</div>
      <div className="max-h-[360px] overflow-auto rounded-md border border-border">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {header.map((h, i) => (
                <th key={`h-${h}`} className="border border-border px-0 py-0 text-left">
                  <button
                    type="button"
                    onClick={() => toggleSort(i)}
                    className="w-full px-2 py-1 text-left hover:bg-muted/70"
                  >
                    {h} {sortCol === i ? (asc ? "▲" : "▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, ri) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional table row
              <tr key={`r-${ri}`} className="even:bg-muted/30">
                {row.map((cell, ci) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional table cell
                  <td key={`c-${ri}-${ci}`} className="border border-border px-2 py-1 align-top">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
