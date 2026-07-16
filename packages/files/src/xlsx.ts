import * as XLSX from "xlsx";
import type { SheetData } from "./types.js";

export async function readXLSX(file: Blob): Promise<{ sheets: SheetData[] }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      return { name, rows: [] as string[][] };
    }
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
    }) as string[][];
    return {
      name,
      rows: rows.map((row) => row.map((cell) => String(cell ?? ""))),
    };
  });
  return { sheets };
}

export function writeXLSX(sheets: SheetData[]): Blob {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, ws, sheet.name);
  }
  const array = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Blob([array], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
