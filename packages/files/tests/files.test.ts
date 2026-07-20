import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { readDOCX, readPDF, readXLSX, writeCSV, writePDF, writeXLSX } from "../src/index.js";

const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

function loadFixture(name: string): Blob {
  const buffer = readFileSync(path.join(fixturesDir, name));
  return new Blob([buffer]);
}

describe("files package", () => {
  it("PDF read extracts text from fixture", async () => {
    const text = await readPDF(loadFixture("sample.pdf"));
    expect(text).toContain("sample PDF text");
  });

  it("XLSX read parses sheets and rows correctly", async () => {
    const { sheets } = await readXLSX(loadFixture("sample.xlsx"));
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.name).toBe("Sheet1");
    expect(sheets[0]?.rows[0]).toEqual(["Name", "Value"]);
    expect(sheets[0]?.rows[1]).toEqual(["Alpha", "100"]);
  });

  it("DOCX read strips formatting to plain text", async () => {
    const text = await readDOCX(loadFixture("sample.docx"));
    expect(text).toContain("Sample DOCX plain text");
  });

  it("CSV write escapes quotes, commas, newlines correctly", async () => {
    const blob = writeCSV([
      ["normal", "value"],
      ['has "quotes"', "comma,here"],
      ["line\nbreak", "ok"],
    ]);
    const csv = await blob.text();
    expect(csv).toContain('"has ""quotes"""');
    expect(csv).toContain('"comma,here"');
    expect(csv).toContain('"line\nbreak"');
  });

  it("XLSX write roundtrip via SheetJS", async () => {
    const original = {
      sheets: [
        {
          name: "Data",
          rows: [
            ["A", "B"],
            ["1", "2"],
          ],
        },
      ],
    };
    const blob = writeXLSX(original.sheets);
    const parsed = await readXLSX(blob);
    expect(parsed.sheets[0]?.rows).toEqual(original.sheets[0]?.rows);
  });

  it("PDF write produces valid PDF parseable by pdf.js", async () => {
    const blob = await writePDF({
      title: "Generated",
      sections: [{ heading: "Section", paragraphs: ["Paragraph content here."] }],
    });
    const buffer = await blob.arrayBuffer();
    const doc = await pdfjs.getDocument({
      data: buffer,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;
    expect(doc.numPages).toBeGreaterThan(0);
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    expect(text).toContain("Generated");
  });
});
