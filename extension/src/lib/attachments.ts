import { readPDF, readXLSX } from "@combo/files";

export type AttachmentKind = "text" | "csv" | "pdf" | "xlsx" | "image" | "unknown";

export interface Attachment {
  id: string;
  name: string;
  kind: AttachmentKind;
  mime: string;
  size: number;
  text?: string;
  rows?: string[][];
  dataUrl?: string;
  status: "parsing" | "ready" | "error";
  error?: string;
}

const TEXT_EXT = ["txt", "md", "json", "log", "csv", "tsv"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

function ext(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function kindFor(name: string, mime: string): AttachmentKind {
  const e = ext(name);
  if (IMAGE_EXT.includes(e) || mime.startsWith("image/")) return "image";
  if (e === "pdf" || mime === "application/pdf") return "pdf";
  if (e === "xlsx" || mime.includes("spreadsheet")) return "xlsx";
  if (e === "csv" || e === "tsv") return "csv";
  if (TEXT_EXT.includes(e) || mime.startsWith("text/")) return "text";
  return "unknown";
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `att-${Date.now()}-${counter}`;
}

/** Parse a File into an Attachment (text/rows for docs, dataUrl for images). */
export async function parseAttachment(file: File): Promise<Attachment> {
  const kind = kindFor(file.name, file.type);
  const base: Attachment = {
    id: nextId(),
    name: file.name,
    kind,
    mime: file.type || "application/octet-stream",
    size: file.size,
    status: "parsing",
  };

  try {
    if (kind === "image") {
      base.dataUrl = await readAsDataUrl(file);
      base.status = "ready";
    } else if (kind === "text") {
      base.text = await file.text();
      if (ext(file.name) === "csv" || ext(file.name) === "tsv") {
        base.rows = csvToRows(base.text);
      }
      base.status = "ready";
    } else if (kind === "csv") {
      base.text = await file.text();
      base.rows = csvToRows(base.text);
      base.status = "ready";
    } else if (kind === "pdf") {
      base.text = await readPDF(file);
      base.status = "ready";
    } else if (kind === "xlsx") {
      const { sheets } = await readXLSX(file);
      const first = sheets[0];
      base.rows = first?.rows ?? [];
      base.text = sheets
        .map((s) => `# ${s.name}\n${s.rows.map((r) => r.join(",")).join("\n")}`)
        .join("\n\n");
      base.status = "ready";
    } else {
      base.text = await file.text().catch(() => "");
      base.status = base.text ? "ready" : "error";
      if (!base.text) base.error = "unsupported file type";
    }
  } catch (error) {
    base.status = "error";
    base.error = error instanceof Error ? error.message : String(error);
  }
  return base;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return (async () => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const chunks: string[] = [];
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    const base64 = btoa(chunks.join(""));
    const mime = (file as File).type || "application/octet-stream";
    return `data:${mime};base64,${base64}`;
  })();
}

/** Minimal CSV → rows (handles quoted fields with embedded commas/newlines). */
export function csvToRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Build the text to inject into the user message for a set of attachments. */
export function attachmentsToContext(atts: Attachment[]): string {
  const ready = atts.filter((a) => a.status === "ready");
  if (ready.length === 0) return "";
  return ready
    .map((a) => {
      if (a.kind === "image") {
        return `--- Attachment: ${a.name} (image, ${a.mime}, ${Math.round(a.size / 1024)} KB) ---\n[image shown in preview]`;
      }
      const body = a.text ?? (a.rows ? a.rows.map((r) => r.join(",")).join("\n") : "");
      const truncated =
        body.length > 20000
          ? `${body.slice(0, 20000)}\n…(truncated, ${body.length} chars total)`
          : body;
      return `--- Attachment: ${a.name} (${a.kind}) ---\n${truncated}`;
    })
    .join("\n\n");
}
