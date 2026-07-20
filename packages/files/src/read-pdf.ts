import { createRequire } from "node:module";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const require = createRequire(import.meta.url);
pdfjs.GlobalWorkerOptions.workerSrc = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

export async function readPDF(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({
    data: buffer,
    useWorkerFetch: false,
    isEvalSupported: false,
  }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pages.push(text);
  }

  return pages.join("\n").trim();
}
