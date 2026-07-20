import {
  type ContentRequest,
  type ContentResponse,
  RuntimeMessageSchema,
  getProtocolVersion,
} from "@combo/shared";

const OFFSCREEN_URL = chrome.runtime.getURL("src/offscreen/offscreen.html");

async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [OFFSCREEN_URL],
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.WORKERS],
    justification: "Persistent workers for RAG indexing and agent orchestration",
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
    // Side panel API may be unavailable in test environments
  });
  void ensureOffscreenDocument();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureOffscreenDocument();
});

// ── tab helpers ────────────────────────────────────────────────────────────

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function runContent(
  tabId: number | undefined,
  request: ContentRequest,
): Promise<ContentResponse> {
  const targetId = tabId ?? (await activeTabId());
  if (targetId == null) {
    return { ok: false, error: "no active tab — open a tab first" };
  }
  try {
    const res = (await chrome.tabs.sendMessage(targetId, {
      type: "combo:content",
      request,
    })) as ContentResponse;
    return res ?? { ok: false, error: "no response from content script" };
  } catch (error) {
    return {
      ok: false,
      error: `Could not reach tab ${targetId} (${
        error instanceof Error ? error.message : String(error)
      }). Reload the tab so the Combo content script injects.`,
    };
  }
}

function dataUrl(text: string, mime: string): string {
  return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
}

// ── runtime message dispatcher ────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "combo:ping") {
    sendResponse({ ok: true, protocol: getProtocolVersion() });
    return true;
  }

  const parsed = RuntimeMessageSchema.safeParse(message);
  if (!parsed.success) {
    return false; // not a combo runtime message — let another listener handle it
  }
  const msg = parsed.data;

  void (async () => {
    try {
      switch (msg.type) {
        case "content": {
          sendResponse(await runContent(msg.tabId, msg.request));
          break;
        }
        case "list_tabs": {
          const tabs = await chrome.tabs.query({});
          sendResponse({
            tabs: tabs.map((t) => ({ id: t.id, title: t.title ?? "", url: t.url ?? "" })),
          });
          break;
        }
        case "open_tab": {
          const tab = await chrome.tabs.create({ url: msg.url, active: msg.active ?? true });
          sendResponse({ id: tab.id, url: tab.url ?? msg.url });
          break;
        }
        case "activate_tab": {
          await chrome.tabs.update(msg.tabId, { active: true });
          sendResponse({ ok: true });
          break;
        }
        case "navigate": {
          const targetId = msg.tabId ?? (await activeTabId());
          if (targetId == null) {
            sendResponse({ ok: false, error: "no active tab" });
            break;
          }
          await chrome.tabs.update(targetId, { url: msg.url });
          sendResponse({ ok: true, url: msg.url });
          break;
        }
        case "go_back": {
          const targetId = msg.tabId ?? (await activeTabId());
          if (targetId == null) {
            sendResponse({ ok: false, error: "no active tab" });
            break;
          }
          await chrome.tabs.goBack(targetId);
          sendResponse({ ok: true });
          break;
        }
        case "close_tab": {
          await chrome.tabs.remove(msg.tabId);
          sendResponse({ ok: true });
          break;
        }
        case "download_text": {
          const id = await chrome.downloads.download({
            url: dataUrl(msg.text, msg.mime ?? "text/plain"),
            filename: msg.filename,
            saveAs: false,
          });
          sendResponse({ ok: true, id });
          break;
        }
        default: {
          sendResponse({
            ok: false,
            error: `unhandled runtime message ${(msg as { type: string }).type}`,
          });
        }
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();

  return true; // async response
});
