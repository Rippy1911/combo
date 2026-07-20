import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolChip, type ToolChipData, previewableRows } from "./ToolChip";

describe("previewableRows", () => {
  it("extracts rows from parse_data result", () => {
    const chip: ToolChipData = {
      tool: "parse_data",
      result: {
        rows: [
          ["a", "b"],
          ["c", "d"],
        ],
        notes: "",
      },
    };
    expect(previewableRows(chip)?.rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("extracts first table from scrape_tables result", () => {
    const chip: ToolChipData = {
      tool: "scrape_tables",
      result: {
        tables: [
          [
            ["h1", "h2"],
            ["v1", "v2"],
          ],
        ],
      },
    };
    expect(previewableRows(chip)?.rows).toEqual([
      ["h1", "h2"],
      ["v1", "v2"],
    ]);
  });

  it("builds headers for query_all items", () => {
    const chip: ToolChipData = {
      tool: "query_all",
      result: { items: [{ text: "Buy", selector: "a.buy", attrs: { href: "/buy" } }] },
    };
    const p = previewableRows(chip);
    expect(p?.headers).toEqual(["text", "selector", "href"]);
    expect(p?.rows[0]).toEqual(["Buy", "a.buy", "/buy"]);
  });

  it("extracts rows from export_csv args", () => {
    const chip: ToolChipData = { tool: "export_csv", args: { rows: [["x", "y"]] } };
    expect(previewableRows(chip)?.rows).toEqual([["x", "y"]]);
  });

  it("returns null for tools without row data", () => {
    expect(previewableRows({ tool: "get_page", result: { ok: true } })).toBeNull();
  });
});

describe("ToolChip preview button", () => {
  it("shows the eye button when previewable and onPreview is provided", () => {
    const html = renderToString(
      <ToolChip
        chip={{ tool: "parse_data", result: { rows: [["a", "b"]] }, status: "ok" }}
        onPreview={() => undefined}
      />,
    );
    expect(html).toContain('data-testid="chip-preview"');
    expect(html).toContain("1");
  });

  it("hides the eye button when no onPreview is provided", () => {
    const html = renderToString(
      <ToolChip chip={{ tool: "parse_data", result: { rows: [["a", "b"]] }, status: "ok" }} />,
    );
    expect(html).not.toContain('data-testid="chip-preview"');
  });
});
