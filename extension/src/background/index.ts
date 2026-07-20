import { getProtocolVersion } from "@combo/shared";
import type { OffscreenPortMessage } from "@combo/shared";

const OFFSCREEN_URL = chrome.runtime.getURL("src/offscreen/offscreen.html");

/** Ports that want chat events (side panel). */
const chatPorts = new Set<chrome.runtime.Port>();
/** Route streaming replies only to the port that started the request. */
const requestOwners = new Map<string, chrome.runtime.Port>();

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

function forwardToOwner(message: OffscreenPortMessage): void {
  const requestId =
    "requestId" in message && typeof message.requestId === "string" ? message.requestId : null;
  if (!requestId) return;
  const owner = requestOwners.get(requestId);
  if (owner) {
    try {
      owner.postMessage(message);
    } catch {
      requestOwners.delete(requestId);
    }
    if (
      (message.type === "combo:chat-chunk" && message.done) ||
      message.type === "combo:chat-error" ||
      message.type === "combo:test-connection-result"
    ) {
      requestOwners.delete(requestId);
    }
    return;
  }
  // Fallback: no owner map (e.g. SW restart mid-stream) — drop secrets, only fan-out non-sensitive.
  if (message.type === "combo:chat-start" || message.type === "combo:test-connection") {
    return;
  }
  for (const port of chatPorts) {
    try {
      port.postMessage(message);
    } catch {
      chatPorts.delete(port);
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "combo-chat") {
    return;
  }

  chatPorts.add(port);
  port.onDisconnect.addListener(() => {
    chatPorts.delete(port);
    for (const [id, owner] of requestOwners) {
      if (owner === port) requestOwners.delete(id);
    }
  });

  port.onMessage.addListener((message: OffscreenPortMessage) => {
    if (
      message?.type === "combo:chat-start" ||
      message?.type === "combo:test-connection" ||
      message?.type === "combo:chat-abort"
    ) {
      if ("requestId" in message && typeof message.requestId === "string") {
        requestOwners.set(message.requestId, port);
      }
      void ensureOffscreenDocument().then(() => {
        chrome.runtime.sendMessage(message);
      });
    }
  });
});

chrome.runtime.onMessage.addListener((message: OffscreenPortMessage) => {
  if (
    message?.type === "combo:chat-chunk" ||
    message?.type === "combo:chat-error" ||
    message?.type === "combo:test-connection-result"
  ) {
    forwardToOwner(message);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "combo:ping") {
    sendResponse({ ok: true, protocol: getProtocolVersion() });
    return true;
  }
  return false;
});
