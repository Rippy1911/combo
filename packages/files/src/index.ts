import { PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import * as XLSX from "xlsx";

/** Supported file formats for ingestion and generation. */
export type FileFormat = "pdf" | "docx" | "xlsx" | "csv" | "txt" | "md";

export interface ParsedDocument {
  id: string;
  format: FileFormat;
  text: string;
  metadata: Record<string, string>;
}

export interface SheetData {
  name: string;
  rows: string[][];
}

export interface PdfSection {
  heading?: string;
  body: string;
}

export interface WritePdfOptions {
  title?: string;
  sections: PdfSection[];
}

export interface FileParser {
  supportedFormats(): FileFormat[];
  parse(data: ArrayBuffer, format: FileFormat): Promise<ParsedDocument>;
}

export const FILES_PACKAGE_VERSION = "0.1.0" as const;

export function getFilesPackageVersion(): typeof FILES_PACKAGE_VERSION {
  return FILES_PACKAGE_VERSION;
}

// ── PDF (pdf.js read / pdf-lib write) ────────────────────────────────────────

/** Read a PDF Blob and return its concatenated page text. */
export async function readPDF(file: Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    for (const item of content.items) {
      text += `${itemStr(item)} `;
    }
  }
  return text.trim();
}

/** Best-effort text extraction from a pdf.js content item (TextItem or TextMarkedContent). */
function itemStr(item: unknown): string {
  const str = (item as { str?: unknown }).str;
  return typeof str === "string" ? str : "";
}

/** Write a basic-layout PDF from a title + sections. */
export async function writePDF(options: WritePdfOptions): Promise<Blob> {
  const doc = await PDFDocument.create();
  if (options.title) doc.setTitle(options.title);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const bodySize = 12;
  const headingSize = 14;
  const titleSize = 20;
  const lineHeight = 18;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  if (options.title) {
    page.drawText(options.title, { x: margin, y, size: titleSize, font: bold });
    y -= titleSize + 10;
  }

  for (const section of options.sections) {
    if (section.heading) {
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(section.heading, { x: margin, y, size: headingSize, font: bold });
      y -= lineHeight;
    }
    const maxW = pageWidth - margin * 2;
    for (const line of wrapText(section.body, font, maxW, bodySize)) {
      if (y < margin + lineHeight) {
        page = doc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y, size: bodySize, font });
      y -= lineHeight;
    }
    y -= lineHeight;
  }

  const bytes = await doc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}

function wrapText(text: string, font: PDFFont, maxWidth: number, size: number): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

// ── Spreadsheets (SheetJS read/write) + CSV ────────────────────────────────

/** Read an XLSX Blob into per-sheet row arrays. */
export async function readXLSX(file: Blob): Promise<{ sheets: SheetData[] }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheets: SheetData[] = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    if (!ws) return { name, rows: [] };
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      blankrows: false,
      defval: "",
    });
    const rows = raw.map((r) => r.map((c) => String(c)));
    return { name, rows };
  });
  return { sheets };
}

/** Write rows to a CSV Blob. */
export function writeCSV(rows: string[][]): Blob {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(ws);
  return new Blob([csv], { type: "text/csv;charset=utf-8" });
}

/** Write sheets to an XLSX Blob. */
export function writeXLSX(sheets: SheetData[]): Blob {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([new Uint8Array(out)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
