/** Supported file formats for ingestion and generation (Phase B). */
export type FileFormat = "pdf" | "docx" | "xlsx" | "csv" | "txt" | "md";

export interface ParsedDocument {
  id: string;
  format: FileFormat;
  text: string;
  metadata: Record<string, string>;
}

/** File parser interface stub (pdf.js, mammoth, SheetJS in Phase B). */
export interface FileParser {
  supportedFormats(): FileFormat[];
  parse(data: ArrayBuffer, format: FileFormat): Promise<ParsedDocument>;
}

export const FILES_PACKAGE_VERSION = "0.1.0" as const;

export function getFilesPackageVersion(): typeof FILES_PACKAGE_VERSION {
  return FILES_PACKAGE_VERSION;
}
