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

useOffscreenStore.getState().setReady(true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "combo:offscreen-ping") {
    sendResponse({ ok: true, ready: useOffscreenStore.getState().ready });
    return true;
  }
  return false;
});
