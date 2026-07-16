import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PDFDoc } from "./types.js";

export async function writePDF(doc: PDFDoc): Promise<Blob> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([612, 792]);
  let y = 750;
  const margin = 50;
  const lineHeight = 16;

  const drawText = (text: string, size: number, bold = false) => {
    const words = text.split(" ");
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const width = (bold ? boldFont : font).widthOfTextAtSize(testLine, size);
      if (width > 512 && line) {
        page.drawText(line, {
          x: margin,
          y,
          size,
          font: bold ? boldFont : font,
          color: rgb(0, 0, 0),
        });
        y -= lineHeight;
        line = word;
        if (y < margin) {
          page = pdf.addPage([612, 792]);
          y = 750;
        }
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, {
        x: margin,
        y,
        size,
        font: bold ? boldFont : font,
        color: rgb(0, 0, 0),
      });
      y -= lineHeight * 1.5;
    }
  };

  drawText(doc.title, 20, true);
  y -= 10;

  for (const section of doc.sections) {
    drawText(section.heading, 14, true);
    for (const paragraph of section.paragraphs) {
      drawText(paragraph, 11);
    }
    y -= 10;
  }

  const bytes = await pdf.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
