import { describe, expect, it } from "vitest";
import { attachmentsToContext, csvToRows, parseAttachment } from "./attachments";

describe("csvToRows", () => {
  it("parses simple csv", () => {
    expect(csvToRows("a,b\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("handles quoted fields with commas and newlines", () => {
    expect(csvToRows('name,note\n"Piadina","warm, soft"\n"X","line1\nline2"')).toEqual([
      ["name", "note"],
      ["Piadina", "warm, soft"],
      ["X", "line1\nline2"],
    ]);
  });

  it("escapes doubled quotes", () => {
    expect(csvToRows('a,"b""c"')).toEqual([["a", 'b"c']]);
  });
});

describe("attachmentsToContext", () => {
  it("returns empty string for no ready attachments", () => {
    expect(attachmentsToContext([])).toBe("");
    expect(
      attachmentsToContext([
        { id: "x", name: "f", kind: "text", mime: "text/plain", size: 10, status: "parsing" },
      ]),
    ).toBe("");
  });

  it("includes text attachment content", () => {
    const ctx = attachmentsToContext([
      {
        id: "x",
        name: "notes.txt",
        kind: "text",
        mime: "text/plain",
        size: 5,
        status: "ready",
        text: "hello",
      },
    ]);
    expect(ctx).toContain("notes.txt");
    expect(ctx).toContain("hello");
  });

  it("describes image attachments without dumping bytes", () => {
    const ctx = attachmentsToContext([
      {
        id: "x",
        name: "pic.png",
        kind: "image",
        mime: "image/png",
        size: 2048,
        status: "ready",
        dataUrl: "data:...",
      },
    ]);
    expect(ctx).toContain("pic.png");
    expect(ctx).toContain("[image shown in preview]");
    expect(ctx).not.toContain("data:...");
  });

  it("truncates very large text", () => {
    const big = "a".repeat(30000);
    const ctx = attachmentsToContext([
      {
        id: "x",
        name: "big.txt",
        kind: "text",
        mime: "text/plain",
        size: 30000,
        status: "ready",
        text: big,
      },
    ]);
    expect(ctx).toContain("truncated");
    expect(ctx.length).toBeLessThan(30000);
  });
});

describe("parseAttachment", () => {
  it("parses a text file", async () => {
    const file = new File(["hello world"], "notes.txt", { type: "text/plain" });
    const att = await parseAttachment(file);
    expect(att.kind).toBe("text");
    expect(att.status).toBe("ready");
    expect(att.text).toBe("hello world");
  });

  it("parses a csv file into rows + text", async () => {
    const file = new File(["a,b\nc,d"], "data.csv", { type: "text/csv" });
    const att = await parseAttachment(file);
    expect(att.kind).toBe("csv");
    expect(att.rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(att.text).toBe("a,b\nc,d");
  });

  it("parses an image into a data url", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "pic.png", { type: "image/png" });
    const att = await parseAttachment(file);
    expect(att.kind).toBe("image");
    expect(att.status).toBe("ready");
    expect(att.dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
