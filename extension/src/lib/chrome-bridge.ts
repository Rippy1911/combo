import type { BrowserBridge } from "@combo/agents";
import type { ContentRequest, ContentResponse, RuntimeMessage } from "@combo/shared";

function send<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/**
 * BrowserBridge backed by the MV3 service worker. Each method sends a typed
 * RuntimeMessage to the background, which forwards content ops to the active
 * tab's content script or performs the tab/download action directly.
 */
export function createChromeBridge(): BrowserBridge {
  return {
    runContent: (request, tabId) => send<ContentResponse>({ type: "content", tabId, request }),

    listTabs: async () => {
      const res = await send<{ tabs: Array<{ id: number; title: string; url: string }> }>({
        type: "list_tabs",
      });
      return res.tabs;
    },

    openTab: (url, active) => send<{ id: number; url: string }>({ type: "open_tab", url, active }),

    activateTab: (tabId) => send<{ ok: boolean }>({ type: "activate_tab", tabId }),

    navigate: (url, tabId) => send<{ ok: boolean; url: string }>({ type: "navigate", url, tabId }),

    goBack: (tabId) => send<{ ok: boolean }>({ type: "go_back", tabId }),

    closeTab: (tabId) => send<{ ok: boolean }>({ type: "close_tab", tabId }),

    downloadText: (filename, text, mime) =>
      send<{ ok: boolean; id?: number }>({ type: "download_text", filename, text, mime }),
  };
}

// Re-export the content request type for callers that build requests by hand.
export type { ContentRequest };
