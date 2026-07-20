import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type SheetData, readPDF, readXLSX, writeCSV, writePDF, writeXLSX } from "../index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): Blob => new Blob([readFileSync(join(__dirname, "fixtures", name))]);

describe("@combo/files readPDF", () => {
  it("extracts text from the committed PDF fixture", async () => {
    const text = await readPDF(fixture("sample.pdf"));
    expect(text).toContain("Combo Fixture Report");
    expect(text).toContain("Hello world from fixture");
  }, 30_000);
});

describe("@combo/files readXLSX", () => {
  it("reads sheets and rows from the committed XLSX fixture", async () => {
    const { sheets } = await readXLSX(fixture("sample.xlsx"));
    expect(sheets.length).toBe(1);
    expect(sheets[0].name).toBe("Sheet1");
    expect(sheets[0].rows[0]).toEqual(["name", "value"]);
    expect(sheets[0].rows[1]).toEqual(["alpha", "1"]);
    expect(sheets[0].rows[2]).toEqual(["beta", "2"]);
  });
});

describe("@combo/files writePDF", () => {
  it("writes a PDF that pdf.js can read back", async () => {
    const blob = await writePDF({
      title: "Combo Roundtrip",
      sections: [
        { heading: "Intro", body: "Hello world from the write path" },
        { heading: "Body", body: "Second section with some content to wrap." },
      ],
    });
    expect(blob.type).toBe("application/pdf");
    const text = await readPDF(blob);
    expect(text).toContain("Combo Roundtrip");
    expect(text).toContain("Hello world from the write path");
    expect(text).toContain("Second section with some content to wrap.");
  }, 30_000);

  it("wraps long paragraphs, handles empty paragraphs, and paginates", async () => {
    const longPara =
      "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega";
    const filler = Array.from({ length: 45 }, (_, i) => `filler line ${i}`).join("\n");
    const body = `${longPara}\n\n${filler}`;
    const blob = await writePDF({
      title: "Combo Long",
      sections: [{ heading: "Big", body }],
    });
    const text = await readPDF(blob);
    expect(text).toContain("alpha");
    expect(text).toContain("filler line 44");
    expect(text).toContain("omega");
  }, 30_000);
});

describe("@combo/files writeXLSX", () => {
  it("writes sheets that SheetJS can read back", async () => {
    const sheets: SheetData[] = [
      {
        name: "Sheet1",
        rows: [
          ["a", "b"],
          ["1", "2"],
        ],
      },
      {
        name: "Sheet2",
        rows: [
          ["c", "d"],
          ["3", "4"],
        ],
      },
    ];
    const blob = writeXLSX(sheets);
    expect(blob.type).toContain("spreadsheetml");
    const { sheets: readBack } = await readXLSX(blob);
    expect(readBack.length).toBe(2);
    expect(readBack[0].rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(readBack[1].name).toBe("Sheet2");
    expect(readBack[1].rows).toEqual([
      ["c", "d"],
      ["3", "4"],
    ]);
  });
});

describe("@combo/files writeCSV", () => {
  it("writes rows to a CSV Blob", async () => {
    const blob = writeCSV([
      ["name", "value"],
      ["alpha", "1"],
    ]);
    expect(blob.type).toBe("text/csv;charset=utf-8");
    const text = await blob.text();
    expect(text).toContain("name,value");
    expect(text).toContain("alpha,1");
  });
});
