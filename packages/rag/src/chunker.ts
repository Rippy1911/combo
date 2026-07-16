const CHUNK_SIZE_CHARS = 2000;
const OVERLAP_CHARS = 200;

const SENTENCE_END = /[.!?。！？]\s+/;

export interface TextChunk {
  content: string;
  metadata: Record<string, unknown>;
}

export function splitText(text: string, metadata: Record<string, unknown> = {}): TextChunk[] {
  if (!text.trim()) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE_CHARS, text.length);

    if (end < text.length) {
      const slice = text.slice(start, end);
      const sentenceMatch = slice.match(SENTENCE_END);
      if (sentenceMatch && sentenceMatch.index !== undefined) {
        const boundary = sentenceMatch.index + sentenceMatch[0].length;
        if (boundary > OVERLAP_CHARS) {
          end = start + boundary;
        }
      } else {
        const lastSpace = slice.lastIndexOf(" ");
        if (lastSpace > OVERLAP_CHARS) {
          end = start + lastSpace;
        }
      }
    }

    const content = text.slice(start, end).trim();
    if (content) {
      chunks.push({ content, metadata: { ...metadata, chunkIndex: chunks.length } });
    }

    if (end >= text.length) {
      break;
    }

    const nextStart = end - OVERLAP_CHARS;
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}

export function getOverlap(text1: string, text2: string): string {
  const maxLen = Math.min(text1.length, text2.length);
  for (let len = maxLen; len > 0; len--) {
    if (text1.endsWith(text2.slice(0, len))) {
      return text2.slice(0, len);
    }
  }
  return "";
}

export { CHUNK_SIZE_CHARS, OVERLAP_CHARS };
