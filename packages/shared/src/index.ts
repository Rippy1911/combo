import { z } from "zod";

/** Combo agent message schema (Phase A stub). */
export const MessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

export type Message = z.infer<typeof MessageSchema>;

/** Protocol version for extension ↔ offscreen communication. */
export const COMBO_PROTOCOL_VERSION = "0.1.0" as const;

export function getProtocolVersion(): typeof COMBO_PROTOCOL_VERSION {
  return COMBO_PROTOCOL_VERSION;
}

// ── Browser content ops (executed in the content script) ───────────────────

/** Ops the content script can run against the active tab's DOM. */
export const BrowserToolNameSchema = z.enum([
  "get_page",
  "get_links",
  "query_all",
  "extract",
  "click",
  "type_text",
  "scroll",
  "find_text",
  "get_interactive",
  "click_index",
  "type_index",
  "scrape_tables",
]);
export type BrowserToolName = z.infer<typeof BrowserToolNameSchema>;

export const ContentRequestSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("get_page") }),
  z.object({
    op: z.literal("get_links"),
    selector: z.string().optional(),
    limit: z.number().optional(),
  }),
  z.object({
    op: z.literal("query_all"),
    selector: z.string().min(1),
    limit: z.number().int().positive().max(200).optional(),
    attributes: z.array(z.string()).optional(),
  }),
  z.object({
    op: z.literal("extract"),
    selector: z.string().min(1),
    attribute: z.string().optional(),
  }),
  z.object({ op: z.literal("click"), selector: z.string().min(1) }),
  z.object({
    op: z.literal("type_text"),
    selector: z.string().min(1),
    text: z.string(),
    submit: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("scroll"),
    selector: z.string().optional(),
    dy: z.number().optional(),
    toBottom: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("find_text"),
    text: z.string().min(1),
    scrollIntoView: z.boolean().optional(),
  }),
  z.object({ op: z.literal("get_interactive") }),
  z.object({ op: z.literal("click_index"), index: z.number().int().nonnegative() }),
  z.object({
    op: z.literal("type_index"),
    index: z.number().int().nonnegative(),
    text: z.string(),
    submit: z.boolean().optional(),
  }),
  z.object({ op: z.literal("scrape_tables") }),
]);
export type ContentRequest = z.infer<typeof ContentRequestSchema>;

export const ContentResponseSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
});
export type ContentResponse = z.infer<typeof ContentResponseSchema>;

// ── Runtime messages (sidepanel ↔ service worker) ───────────────────────────

export const RuntimeMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("content"),
    tabId: z.number().int().optional(),
    request: ContentRequestSchema,
  }),
  z.object({ type: z.literal("list_tabs") }),
  z.object({ type: z.literal("open_tab"), url: z.string(), active: z.boolean().optional() }),
  z.object({ type: z.literal("activate_tab"), tabId: z.number().int() }),
  z.object({ type: z.literal("navigate"), url: z.string(), tabId: z.number().int().optional() }),
  z.object({ type: z.literal("go_back"), tabId: z.number().int().optional() }),
  z.object({ type: z.literal("close_tab"), tabId: z.number().int() }),
  z.object({
    type: z.literal("download_text"),
    filename: z.string(),
    text: z.string(),
    mime: z.string().optional(),
  }),
]);
export type RuntimeMessage = z.infer<typeof RuntimeMessageSchema>;

/** Tools that mutate the page / open URLs / handle credentials — require approval unless auto mode. */
export const SENSITIVE_TOOLS = new Set([
  "click",
  "type_text",
  "click_index",
  "type_index",
  "open_tab",
  "activate_tab",
  "navigate",
  "go_back",
  "close_tab",
  "login",
  "scrape_catalog",
]);
