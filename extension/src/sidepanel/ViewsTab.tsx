import {
  INSPECTABLE_DBS,
  type InspectRow,
  type SavedView,
  ViewStore,
  inspectStore,
} from "@/lib/views";
import { useCallback, useEffect, useState } from "react";
import { DataTable } from "./DataTable";

type Sub = "library" | "inspector";

export function ViewsTab({
  onExport,
  stashed,
  onConsumeStashed,
}: {
  onExport: (filename: string, text: string, mime: string) => void | Promise<void>;
  stashed: { title: string; rows: string[][] } | null;
  onConsumeStashed: () => void;
}) {
  const [sub, setSub] = useState<Sub>("library");
  const [library, setLibrary] = useState<SavedView[]>([]);
  const [active, setActive] = useState<{ title: string; rows: string[][] } | null>(null);
  const [inspDb, setInspDb] = useState(INSPECTABLE_DBS[0]?.name ?? "");
  const [inspStore, setInspStore] = useState(INSPECTABLE_DBS[0]?.stores[0] ?? "");
  const [inspRows, setInspRows] = useState<InspectRow[]>([]);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => setLibrary(await ViewStore.list()), []);
  useEffect(() => {
    void refresh();
    if (stashed) {
      setActive(stashed);
      onConsumeStashed();
      setSub("library");
    }
  }, [refresh, stashed, onConsumeStashed]);

  const storesForDb = INSPECTABLE_DBS.find((d) => d.name === inspDb)?.stores ?? [];

  const runInspect = async () => {
    setMsg("");
    try {
      setInspRows(await inspectStore(inspDb, inspStore, 40));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      setInspRows([]);
    }
  };

  const saveCurrent = async (name: string, rows: string[][]) => {
    await ViewStore.save({ name, source: "manual", rows });
    setMsg(`Saved view “${name}”`);
    await refresh();
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <div>
        <h2 className="text-sm font-semibold">Views</h2>
        <p className="text-[11px] text-muted-foreground">
          Browse saved tables + Combo's local databases (read-only). Vault values stay redacted.
        </p>
      </div>
      <div className="flex gap-2">
        {(["library", "inspector"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSub(s)}
            className={`rounded-md border px-2 py-1 text-xs ${sub === s ? "border-primary bg-primary/10" : "border-border"}`}
          >
            {s === "library" ? "Library" : "Inspector"}
          </button>
        ))}
      </div>
      {msg ? <p className="text-[11px] text-muted-foreground">{msg}</p> : null}

      {sub === "library" ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              Refresh
            </button>
          </div>
          {active ? (
            <DataTable
              rows={active.rows}
              title={active.title}
              onExport={onExport}
              onSaveView={saveCurrent}
            />
          ) : library.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              No saved views. Ask the agent to <code>save_view</code> after a scrape, or Save view
              from a preview.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {library.map((v) => (
                <li key={v.id} className="rounded-md border border-border p-2">
                  <div className="text-xs font-medium">{v.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {v.source} · {v.rows.length} rows · {new Date(v.updatedAt).toLocaleString()}
                  </div>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setActive({ title: v.name, rows: v.rows })}
                      className="rounded-md border border-border px-2 py-0.5 text-[11px]"
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await ViewStore.delete(v.id);
                        setActive((cur) => (cur?.title === v.name ? null : cur));
                        await refresh();
                      }}
                      className="rounded-md border border-border px-2 py-0.5 text-[11px] text-destructive"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[11px] text-muted-foreground">
            Read-only IDB browser. Vault records show labels + redacted ciphertext only.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              value={inspDb}
              onChange={(e) => {
                setInspDb(e.target.value);
                const stores = INSPECTABLE_DBS.find((d) => d.name === e.target.value)?.stores ?? [];
                setInspStore(stores[0] ?? "");
              }}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {INSPECTABLE_DBS.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name}
                  {d.redactValues ? " (redacted)" : ""}
                </option>
              ))}
            </select>
            <select
              value={inspStore}
              onChange={(e) => setInspStore(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            >
              {storesForDb.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void runInspect()}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              Load
            </button>
          </div>
          {inspRows.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {inspRows.map((r) => (
                <li key={r.key} className="rounded-md border border-border p-1.5">
                  <code className="text-[11px]">{r.key}</code>
                  <div className="mt-0.5 break-all text-[11px] text-muted-foreground">
                    {r.summary}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">Pick a database + store, then Load.</p>
          )}
        </div>
      )}
    </div>
  );
}
