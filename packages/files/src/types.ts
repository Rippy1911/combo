export interface SheetData {
  name: string;
  rows: string[][];
}

export interface PDFSection {
  heading: string;
  paragraphs: string[];
}

export interface PDFDoc {
  title: string;
  sections: PDFSection[];
}

export type FileFormat = "pdf" | "docx" | "xlsx" | "csv" | "txt" | "md";

export const FILES_PACKAGE_VERSION = "0.1.0" as const;

export function getFilesPackageVersion(): typeof FILES_PACKAGE_VERSION {
  return FILES_PACKAGE_VERSION;
}
