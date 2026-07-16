import { DEFAULT_OPENROUTER_MODEL } from "@combo/llm";
import type { Message } from "@combo/shared";
import { create } from "zustand";

export type Phase = "loading" | "first-run" | "locked" | "unlocked";

interface ComboState {
  phase: Phase;
  messages: Message[];
  model: string;
  streaming: boolean;
  error: string | null;
  setPhase: (phase: Phase) => void;
  setMessages: (messages: Message[]) => void;
  appendMessage: (message: Message) => void;
  appendDelta: (delta: string) => void;
  removeMessage: (id: string) => void;
  setModel: (model: string) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
}

export const useComboStore = create<ComboState>((set) => ({
  phase: "loading",
  messages: [],
  model: DEFAULT_OPENROUTER_MODEL,
  streaming: false,
  error: null,
  setPhase: (phase) => set({ phase }),
  setMessages: (messages) => set({ messages }),
  appendMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),
  appendDelta: (delta) =>
    set((s) => {
      const msgs = [...s.messages];
      const last = msgs[msgs.length - 1];
      if (last && last.role === "assistant") {
        msgs[msgs.length - 1] = { ...last, content: last.content + delta };
      }
      return { messages: msgs };
    }),
  removeMessage: (id) => set((s) => ({ messages: s.messages.filter((m) => m.id !== id) })),
  setModel: (model) => set({ model }),
  setStreaming: (streaming) => set({ streaming }),
  setError: (error) => set({ error }),
}));
