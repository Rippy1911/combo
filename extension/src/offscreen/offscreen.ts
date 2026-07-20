import { createOpenRouterClient } from "@combo/llm";
import type { OffscreenPortMessage } from "@combo/shared";
import { getProtocolVersion } from "@combo/shared";
import { create } from "zustand";

interface OffscreenState {
  ready: boolean;
  protocol: string;
  setReady: (ready: boolean) => void;
}

export const useOffscreenStore = create<OffscreenState>((set) => ({
  ready: false,
  protocol: getProtocolVersion(),
  setReady: (ready) => set({ ready }),
}));

const activeChats = new Map<string, AbortController>();

async function handleChatStart(
  msg: Extract<OffscreenPortMessage, { type: "combo:chat-start" }>,
): Promise<void> {
  const controller = new AbortController();
  activeChats.set(msg.requestId, controller);

  const client = createOpenRouterClient({ apiKey: msg.apiKey });
  let fullContent = "";

  try {
    for await (const chunk of client.chat({
      model: msg.model,
      messages: msg.messages,
      stream: true,
      signal: controller.signal,
    })) {
      if (chunk.content) {
        fullContent += chunk.content;
      }
      chrome.runtime.sendMessage({
        type: "combo:chat-chunk",
        requestId: msg.requestId,
        content: fullContent,
        done: chunk.done,
      } satisfies OffscreenPortMessage);
      if (chunk.done) {
        break;
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      "statusCode" in error ? (error as { statusCode?: number }).statusCode : undefined;
    chrome.runtime.sendMessage({
      type: "combo:chat-error",
      requestId: msg.requestId,
      error: error.message,
      statusCode,
    } satisfies OffscreenPortMessage);
  } finally {
    activeChats.delete(msg.requestId);
  }
}

async function handleTestConnection(
  msg: Extract<OffscreenPortMessage, { type: "combo:test-connection" }>,
): Promise<void> {
  const client = createOpenRouterClient({ apiKey: msg.apiKey });
  try {
    await client.testConnection();
    chrome.runtime.sendMessage({
      type: "combo:test-connection-result",
      requestId: msg.requestId,
      ok: true,
    } satisfies OffscreenPortMessage);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const statusCode =
      "statusCode" in error ? (error as { statusCode?: number }).statusCode : undefined;
    chrome.runtime.sendMessage({
      type: "combo:test-connection-result",
      requestId: msg.requestId,
      ok: false,
      error: error.message,
      statusCode,
    } satisfies OffscreenPortMessage);
  }
}

chrome.runtime.onMessage.addListener((message: OffscreenPortMessage) => {
  if (message?.type === "combo:chat-start") {
    void handleChatStart(message);
    return;
  }
  if (message?.type === "combo:chat-abort") {
    activeChats.get(message.requestId)?.abort();
    activeChats.delete(message.requestId);
    return;
  }
  if (message?.type === "combo:test-connection") {
    void handleTestConnection(message);
  }
});

useOffscreenStore.getState().setReady(true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "combo:offscreen-ping") {
    sendResponse({ ok: true, ready: useOffscreenStore.getState().ready });
    return true;
  }
  return false;
});
