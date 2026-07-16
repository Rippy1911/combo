import { getProtocolVersion } from "@combo/shared";
import type { OffscreenPortMessage } from "@combo/shared";

const OFFSCREEN_URL = chrome.runtime.getURL("src/offscreen/offscreen.html");

const chatPorts = new Set<chrome.runtime.Port>();

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

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "combo-chat") {
    return;
  }

  chatPorts.add(port);
  port.onDisconnect.addListener(() => {
    chatPorts.delete(port);
  });

  port.onMessage.addListener((message: OffscreenPortMessage) => {
    void ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage(message);
    });
  });
});

chrome.runtime.onMessage.addListener((message: OffscreenPortMessage) => {
  if (
    message?.type === "combo:chat-chunk" ||
    message?.type === "combo:chat-error" ||
    message?.type === "combo:test-connection-result"
  ) {
    for (const port of chatPorts) {
      port.postMessage(message);
    }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "combo:ping") {
    sendResponse({ ok: true, protocol: getProtocolVersion() });
    return true;
  }
  return false;
});
