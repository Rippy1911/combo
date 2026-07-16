import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { PDFDocument, StandardFonts } from "pdf-lib";
import * as XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

if (!existsSync(fixturesDir)) {
  mkdirSync(fixturesDir, { recursive: true });
}

const pdf = await PDFDocument.create();
const page = pdf.addPage();
const font = await pdf.embedFont(StandardFonts.Helvetica);
page.drawText("This is sample PDF text for Combo tests.", { x: 50, y: 700, size: 12, font });
writeFileSync(path.join(fixturesDir, "sample.pdf"), await pdf.save());

const workbook = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([
  ["Name", "Value"],
  ["Alpha", "100"],
  ["Beta", "200"],
]);
XLSX.utils.book_append_sheet(workbook, ws, "Sheet1");
writeFileSync(
  path.join(fixturesDir, "sample.xlsx"),
  XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
);

const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
);
zip.file(
  "_rels/.rels",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
);
zip.file(
  "word/document.xml",
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t>Sample DOCX plain text for Combo tests.</w:t></w:r></w:p></w:body>
</w:document>`,
);
writeFileSync(
  path.join(fixturesDir, "sample.docx"),
  await zip.generateAsync({ type: "nodebuffer" }),
);

console.log("Fixtures generated in", fixturesDir);
