import type { ToolDefinition } from "@combo/llm";
import type { ContentRequest } from "@combo/shared";

/** OpenAI-style function tool definitions exposed to the orchestrator. */
export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_page",
      description: "Read the active tab: title, url, and visible text (truncated).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_links",
      description: "List links on the page (text + href).",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" }, limit: { type: "number" } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_all",
      description:
        "Query elements matching a CSS selector; returns text + selector + picked attrs per item.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          limit: { type: "number" },
          attributes: { type: "array", items: { type: "string" } },
        },
        required: ["selector"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract",
      description: "Extract text or an attribute from the first element matching a selector.",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" }, attribute: { type: "string" } },
        required: ["selector"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click",
      description: "Click the first element matching a CSS selector. Approval-gated.",
      parameters: {
        type: "object",
        properties: { selector: { type: "string" } },
        required: ["selector"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description:
        "Type text into an input matching a selector. Optionally submit the form. Approval-gated.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          text: { type: "string" },
          submit: { type: "boolean" },
        },
        required: ["selector", "text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "Scroll the page or an element. dy=pixels, toBottom=scroll into view bottom.",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string" },
          dy: { type: "number" },
          toBottom: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_text",
      description:
        "Find an interactive element whose text contains the given string; optionally scroll it into view. Returns its selector.",
      parameters: {
        type: "object",
        properties: { text: { type: "string" }, scrollIntoView: { type: "boolean" } },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_interactive",
      description:
        "List interactive elements (links/buttons/inputs) with stable indices for click_index/type_index. Prefer this over guessing CSS.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "click_index",
      description:
        "Click the interactive element at the given index (from get_interactive). Approval-gated.",
      parameters: {
        type: "object",
        properties: { index: { type: "number" } },
        required: ["index"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_index",
      description: "Type text into the interactive element at the given index. Approval-gated.",
      parameters: {
        type: "object",
        properties: {
          index: { type: "number" },
          text: { type: "string" },
          submit: { type: "boolean" },
        },
        required: ["index", "text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_tables",
      description: "Extract all <table> on the page as rows of cells.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tabs",
      description: "List open browser tabs (id, title, url).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "open_tab",
      description: "Open a URL in a new tab and focus it. Approval-gated.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "activate_tab",
      description: "Focus an existing tab by id from list_tabs.",
      parameters: {
        type: "object",
        properties: { tabId: { type: "number" } },
        required: ["tabId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate the active tab to a URL (same tab). Approval-gated.",
      parameters: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "go_back",
      description: "Browser history back in the active tab.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "close_tab",
      description: "Close a tab by id from list_tabs.",
      parameters: {
        type: "object",
        properties: { tabId: { type: "number" } },
        required: ["tabId"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "parse_data",
      description:
        "Extract structured rows from page text (or args.text) using the cheap worker model. Returns {rows, notes}. Prefer this over reading huge text into your own context.",
      parameters: {
        type: "object",
        properties: {
          intent: { type: "string" },
          schema_hint: { type: "string" },
          text: {
            type: "string",
            description: "Optional explicit text; else uses the active page.",
          },
          use_page: { type: "boolean" },
        },
        required: ["intent"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_csv",
      description: "Download an array of rows as a CSV file.",
      parameters: {
        type: "object",
        properties: { filename: { type: "string" }, rows: { type: "array" } },
        required: ["rows"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "open_preview",
      description:
        "Open a non-blocking preview pane beside the chat to show the user a table, generated HTML report, text, or an image — without closing the chat. Use this to surface scraped/parsed data or generated artifacts for the user to inspect.",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["table", "html", "text", "image"] },
          title: { type: "string" },
          headers: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array" } },
          html: { type: "string" },
          text: { type: "string" },
          src: { type: "string", description: "image src (data: or https:)" },
        },
        required: ["kind", "title"],
        additionalProperties: false,
      },
    },
  },
];

/** Parse a tool's arguments string (JSON) into a record; never throws. */
export function parseToolArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Convert a 2D array of cells into CSV text. */
export function rowsToCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => csvCell(cell ?? "")).join(",")).join("\n");
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Map a content-op tool name + args to a ContentRequest, or null if it's a loop-level tool. */
export function toolArgsToContentRequest(
  name: string,
  args: Record<string, unknown>,
): ContentRequest | null {
  switch (name) {
    case "get_page":
      return { op: "get_page" };
    case "get_links":
      return {
        op: "get_links",
        selector: typeof args.selector === "string" ? args.selector : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      };
    case "query_all":
      return {
        op: "query_all",
        selector: String(args.selector ?? ""),
        limit: typeof args.limit === "number" ? args.limit : undefined,
        attributes: Array.isArray(args.attributes) ? args.attributes.map(String) : undefined,
      };
    case "extract":
      return {
        op: "extract",
        selector: String(args.selector ?? ""),
        attribute: typeof args.attribute === "string" ? args.attribute : undefined,
      };
    case "click":
      return { op: "click", selector: String(args.selector ?? "") };
    case "type_text":
      return {
        op: "type_text",
        selector: String(args.selector ?? ""),
        text: String(args.text ?? ""),
        submit: args.submit !== false,
      };
    case "scroll":
      return {
        op: "scroll",
        selector: typeof args.selector === "string" ? args.selector : undefined,
        dy: typeof args.dy === "number" ? args.dy : undefined,
        toBottom: args.toBottom === true,
      };
    case "find_text":
      return {
        op: "find_text",
        text: String(args.text ?? ""),
        scrollIntoView: args.scrollIntoView === true,
      };
    case "get_interactive":
      return { op: "get_interactive" };
    case "click_index":
      return { op: "click_index", index: Number(args.index ?? 0) };
    case "type_index":
      return {
        op: "type_index",
        index: Number(args.index ?? 0),
        text: String(args.text ?? ""),
        submit: args.submit !== false,
      };
    case "scrape_tables":
      return { op: "scrape_tables" };
    default:
      return null;
  }
}
