import type { Message, OffscreenPortMessage } from "@combo/shared";
import { isInitialized, isUnlocked, lock, setPassphrase, unlock } from "@combo/vault";
import { create } from "zustand";
import { loadMessages } from "./lib/conversation-db";

export type AppPhase = "loading" | "welcome" | "setPassphrase" | "locked" | "unlockDialog" | "chat";

interface AppState {
  phase: AppPhase;
  messages: Message[];
  unlockError: string | null;
  showByok: boolean;
  streaming: boolean;
  init: () => Promise<void>;
  completePassphraseSetup: (passphrase: string) => Promise<void>;
  attemptUnlock: (passphrase: string) => Promise<boolean>;
  doLock: () => Promise<void>;
  setShowByok: (show: boolean) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateMessageContent: (id: string, content: string) => void;
  setStreaming: (streaming: boolean) => void;
  setUnlockError: (error: string | null) => void;
  goToSetPassphrase: () => void;
  setPhase: (phase: AppPhase) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  phase: "loading",
  messages: [],
  unlockError: null,
  showByok: false,
  streaming: false,

  init: async () => {
    const initialized = await isInitialized();
    if (!initialized) {
      set({ phase: "welcome", messages: [] });
      return;
    }
    const messages = await loadMessages();
    if (isUnlocked()) {
      set({ phase: "chat", messages });
    } else {
      set({ phase: "locked", messages });
    }
  },

  completePassphraseSetup: async (passphrase: string) => {
    await setPassphrase(passphrase);
    set({ phase: "chat", unlockError: null });
  },

  attemptUnlock: async (passphrase: string) => {
    const ok = await unlock(passphrase);
    if (ok) {
      const messages = await loadMessages();
      set({ phase: "chat", messages, unlockError: null });
      return true;
    }
    set({ unlockError: "Incorrect passphrase. Please try again." });
    return false;
  },

  doLock: async () => {
    await lock();
    set({ phase: "locked" });
  },

  setShowByok: (show) => set({ showByok: show }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set({ messages: [...get().messages, message] }),
  updateMessageContent: (id, content) =>
    set({
      messages: get().messages.map((m) => (m.id === id ? { ...m, content } : m)),
    }),
  setStreaming: (streaming) => set({ streaming }),
  setUnlockError: (error) => set({ unlockError: error }),
  goToSetPassphrase: () => set({ phase: "setPassphrase" }),
  setPhase: (phase) => set({ phase }),
}));

let chatPort: chrome.runtime.Port | null = null;
let chatPortAlive = false;

function attachDisconnect(port: chrome.runtime.Port): void {
  port.onDisconnect.addListener(() => {
    if (chatPort === port) {
      chatPort = null;
      chatPortAlive = false;
    }
  });
}

export function getChatPort(): chrome.runtime.Port {
  if (!chatPort || !chatPortAlive) {
    chatPort = chrome.runtime.connect({ name: "combo-chat" });
    chatPortAlive = true;
    attachDisconnect(chatPort);
  }
  return chatPort;
}

export function sendPortMessage(message: OffscreenPortMessage): void {
  try {
    getChatPort().postMessage(message);
  } catch {
    chatPort = null;
    chatPortAlive = false;
    getChatPort().postMessage(message);
  }
}

export function onPortMessage(handler: (message: OffscreenPortMessage) => void): () => void {
  const port = getChatPort();
  const listener = (msg: OffscreenPortMessage) => handler(msg);
  port.onMessage.addListener(listener);
  return () => {
    try {
      port.onMessage.removeListener(listener);
    } catch {
      // port already disconnected
    }
  };
}
