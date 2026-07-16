import { type ContentRequest, ContentRequestSchema, type ContentResponse } from "@combo/shared";

const COMBO_CONTENT_MARKER = "combo-content-v0.1";

function markPage(): void {
  document.documentElement.dataset.comboContent = COMBO_CONTENT_MARKER;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", markPage);
} else {
  markPage();
}

// ── helpers ────────────────────────────────────────────────────────────────

function visible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = globalThis.getComputedStyle?.(el);
  if (
    style &&
    (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0)
  ) {
    return false;
  }
  return true;
}

function clickable(el: Element): boolean {
  if (el instanceof HTMLAnchorElement && el.href) return true;
  if (el instanceof HTMLButtonElement) return true;
  if (el.getAttribute("role") === "button") return true;
  if (el.hasAttribute("onclick")) return true;
  const tag = el.tagName.toLowerCase();
  return tag === "a" || tag === "button";
}

function editable(el: Element): boolean {
  if (el instanceof HTMLInputElement) {
    const t = el.type.toLowerCase();
    return t !== "hidden" && t !== "submit" && t !== "button" && t !== "checkbox" && t !== "radio";
  }
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
}

function textOf(el: Element): string {
  return (el.textContent ?? el.getAttribute("aria-label") ?? el.getAttribute("title") ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/** Build a short, stable CSS selector for an element (id > tag+classes > path). */
function selectorFor(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  if (el.classList.length > 0) {
    const cls = Array.from(el.classList)
      .slice(0, 3)
      .map((c) => `.${CSS.escape(c)}`)
      .join("");
    return `${tag}${cls}`;
  }
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter((s) => s.tagName === el.tagName);
    const idx = siblings.indexOf(el) + 1;
    return `${selectorFor(parent)} > ${tag}:nth-of-type(${idx})`;
  }
  return tag;
}

interface InteractiveElement {
  index: number;
  tag: string;
  text: string;
  selector: string;
  attrs: Record<string, string>;
}

function collectInteractive(): InteractiveElement[] {
  const out: InteractiveElement[] = [];
  let index = 0;
  const candidates = document.querySelectorAll(
    "a, button, input, textarea, select, [role='button'], [contenteditable], [onclick], [tabindex]",
  );
  for (const el of candidates) {
    if (!visible(el)) continue;
    if (!clickable(el) && !editable(el)) continue;
    index += 1;
    const attrs: Record<string, string> = {};
    for (const a of ["href", "type", "name", "placeholder", "aria-label", "role", "value"]) {
      const v = el.getAttribute(a);
      if (v) attrs[a] = v.slice(0, 120);
    }
    out.push({
      index,
      tag: el.tagName.toLowerCase(),
      text: textOf(el),
      selector: selectorFor(el),
      attrs,
    });
    if (out.length >= 60) break;
  }
  return out;
}

function findByText(text: string): Element | null {
  const lower = text.toLowerCase();
  const candidates = document.querySelectorAll(
    "a, button, [role='button'], [onclick], input[type='submit'], summary",
  );
  let best: Element | null = null;
  let bestLen = Number.POSITIVE_INFINITY;
  for (const el of candidates) {
    if (!visible(el)) continue;
    const t = textOf(el).toLowerCase();
    if (t?.includes(lower) && t.length < bestLen) {
      best = el;
      bestLen = t.length;
    }
  }
  return best;
}

function tableToRows(table: HTMLTableElement): string[][] {
  const rows: string[][] = [];
  for (const tr of table.querySelectorAll("tr")) {
    const cells = Array.from(tr.querySelectorAll("th,td")).map((c) =>
      (c.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    if (cells.some((c) => c.length > 0)) rows.push(cells);
  }
  return rows;
}

// ── request handler ─────────────────────────────────────────────────────────

async function handle(req: ContentRequest): Promise<ContentResponse> {
  try {
    switch (req.op) {
      case "get_page": {
        return {
          ok: true,
          data: {
            title: document.title,
            url: globalThis.location?.href,
            text: (document.body?.innerText ?? "").slice(0, 12_000),
          },
        };
      }
      case "get_links": {
        const limit = req.limit ?? 40;
        const sel = req.selector ?? "a[href]";
        const links = Array.from(document.querySelectorAll(sel))
          .map((a) => ({
            text: textOf(a),
            href: (a as HTMLAnchorElement).href ?? a.getAttribute("href") ?? "",
          }))
          .filter((l) => l.href)
          .slice(0, limit);
        return { ok: true, data: { links } };
      }
      case "query_all": {
        const limit = req.limit ?? 50;
        const attrs = req.attributes ?? [];
        const nodes = Array.from(document.querySelectorAll(req.selector))
          .filter(visible)
          .slice(0, limit);
        const values = nodes.map((n) => textOf(n));
        const items = nodes.map((n) => {
          const picked: Record<string, string> = {};
          for (const a of attrs) {
            const v = n.getAttribute(a);
            if (v != null) picked[a] = v.slice(0, 200);
          }
          return { text: textOf(n), selector: selectorFor(n), attrs: picked };
        });
        return { ok: true, data: { values, items } };
      }
      case "extract": {
        const el = document.querySelector(req.selector);
        if (!el) return { ok: false, error: `no element matching ${req.selector}` };
        const value = req.attribute ? (el.getAttribute(req.attribute) ?? "") : textOf(el);
        return { ok: true, data: { value } };
      }
      case "click": {
        const el = document.querySelector(req.selector);
        if (!el) return { ok: false, error: `no element matching ${req.selector}` };
        (el as HTMLElement).click();
        return { ok: true, data: { clicked: req.selector } };
      }
      case "type_text": {
        const el = document.querySelector(req.selector);
        if (!el) return { ok: false, error: `no element matching ${req.selector}` };
        const target = el as HTMLInputElement | HTMLTextAreaElement;
        target.focus();
        target.value = req.text;
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        if (req.submit !== false) {
          const form = target.form;
          if (form) form.requestSubmit?.();
        }
        return { ok: true, data: { typed: req.text.length } };
      }
      case "scroll": {
        const target = req.selector
          ? document.querySelector(req.selector)
          : (document.scrollingElement ?? document.body);
        if (!target) return { ok: false, error: `no element matching ${req.selector}` };
        if (req.toBottom) {
          (target as HTMLElement).scrollIntoView({ block: "end" });
        } else {
          (target as HTMLElement).scrollBy?.(0, req.dy ?? 600);
        }
        return { ok: true, data: { scrolled: true } };
      }
      case "find_text": {
        const el = findByText(req.text);
        if (!el) return { ok: false, error: `no element containing "${req.text}"` };
        if (req.scrollIntoView) (el as HTMLElement).scrollIntoView({ block: "center" });
        return { ok: true, data: { matches: [{ selector: selectorFor(el), text: textOf(el) }] } };
      }
      case "get_interactive": {
        return { ok: true, data: { elements: collectInteractive() } };
      }
      case "click_index": {
        const els = collectInteractive();
        const target = els.find((e) => e.index === req.index);
        if (!target) return { ok: false, error: `no interactive element at index ${req.index}` };
        const el = document.querySelector(target.selector);
        if (!el) return { ok: false, error: `selector not found: ${target.selector}` };
        (el as HTMLElement).click();
        return { ok: true, data: { clicked: target.selector, text: target.text } };
      }
      case "type_index": {
        const els = collectInteractive();
        const target = els.find((e) => e.index === req.index);
        if (!target) return { ok: false, error: `no interactive element at index ${req.index}` };
        const el = document.querySelector(target.selector) as
          | HTMLInputElement
          | HTMLTextAreaElement
          | null;
        if (!el) return { ok: false, error: `selector not found: ${target.selector}` };
        el.focus();
        el.value = req.text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (req.submit !== false) {
          const form = el.form;
          if (form) form.requestSubmit?.();
        }
        return { ok: true, data: { typed: req.text.length, into: target.text } };
      }
      case "scrape_tables": {
        const tables = Array.from(document.querySelectorAll("table")).map(tableToRows);
        return { ok: true, data: { tables } };
      }
      default: {
        return { ok: false, error: `unsupported op ${(req as { op: string }).op}` };
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "combo:content") {
    const parsed = ContentRequestSchema.safeParse(message.request);
    if (!parsed.success) {
      sendResponse({ ok: false, error: `invalid content request: ${parsed.error.message}` });
      return false;
    }
    void handle(parsed.data).then(sendResponse);
    return true; // async response
  }
  if (message?.type === "combo:content-ping") {
    sendResponse({ ok: true, marker: COMBO_CONTENT_MARKER });
    return true;
  }
  return false;
});
