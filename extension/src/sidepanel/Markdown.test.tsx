import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  const render = (text: string) => renderToString(<Markdown text={text} />);

  it("renders bold/italic/inline code", () => {
    const html = render("This is **bold** and *italic* and `code`.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain("<code");
    expect(html).toContain(">code</code>");
  });

  it("renders fenced code blocks", () => {
    const html = render("```ts\nconst x = 1;\n```");
    expect(html).toContain("<pre");
    expect(html).toContain("const x = 1;");
  });

  it("renders headings", () => {
    const html = render("## Title");
    expect(html).toContain("<h2");
    expect(html).toContain("Title");
  });

  it("renders bullet + numbered lists", () => {
    const html = render("- a\n- b\n1. one\n2. two");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("<li>a</li>");
    expect(html).toContain("<li>one</li>");
  });

  it("renders tables with header", () => {
    const html = render("| name | ean |\n|---|---|\n| Piadina | 123 |");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("Piadina");
  });

  it("renders links with target blank", () => {
    const html = render("[click](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
  });

  it("renders blockquotes", () => {
    const html = render("> quoted text");
    expect(html).toContain("<blockquote");
    expect(html).toContain("quoted text");
  });

  it("escapes raw html (xss safety)", () => {
    const html = render("<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
  });
});
