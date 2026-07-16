function escapeCsvField(field: string): string {
  if (field.includes('"') || field.includes(",") || field.includes("\n") || field.includes("\r")) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function writeCSV(rows: string[][]): Blob {
  const lines = rows.map((row) => row.map(escapeCsvField).join(","));
  const content = `${lines.join("\n")}\n`;
  return new Blob([content], { type: "text/csv;charset=utf-8" });
}
