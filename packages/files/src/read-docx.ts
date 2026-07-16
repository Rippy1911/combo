import mammoth from "mammoth";

export async function readDOCX(file: Blob): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await mammoth.extractRawText({ buffer });
  return result.value.trim();
}
