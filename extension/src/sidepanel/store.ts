import type { ApprovalMode, Usage } from "@combo/agents";
import { DEFAULT_OPENROUTER_MODEL } from "@combo/llm";
import type { Message } from "@combo/shared";
import { create } from "zustand";
import type { PendingApproval } from "./ApprovalBanner";
import type { ToolChipData } from "./ToolChip";

export type Phase = "loading" | "first-run" | "locked" | "unlocked";

export interface UiTurn {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  chips: ToolChipData[];
  usage?: Usage;
}

interface ComboState {
  phase: Phase;
  // plain chat (legacy)
  messages: Message[];
  model: string;
  streaming: boolean;
  error: string | null;
  // agent
  workerModel: string;
  approvalMode: ApprovalMode;
  agentBusy: boolean;
  turns: UiTurn[];
  pendingApproval: PendingApproval | null;
  sessionUsage: Usage;
  // setters
  setPhase: (phase: Phase) => void;
  setMessages: (messages: Message[]) => void;
  appendMessage: (message: Message) => void;
  appendDelta: (delta: string) => void;
  removeMessage: (id: string) => void;
  setModel: (model: string) => void;
  setStreaming: (streaming: boolean) => void;
  setError: (error: string | null) => void;
  setWorkerModel: (model: string) => void;
  setApprovalMode: (mode: ApprovalMode) => void;
  setAgentBusy: (busy: boolean) => void;
  appendTurn: (turn: UiTurn) => void;
  updateLastTurn: (patch: (t: UiTurn) => UiTurn) => void;
  setPendingApproval: (pending: PendingApproval | null) => void;
  addUsage: (usage: Usage) => void;
  resetAgent: () => void;
}

const ZERO_USAGE: Usage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
};

export const useComboStore = create<ComboState>((set) => ({
  phase: "loading",
  messages: [],
  model: DEFAULT_OPENROUTER_MODEL,
  streaming: false,
  error: null,
  workerModel: "openrouter/openai/gpt-4.1-mini",
  approvalMode: "ask",
  agentBusy: false,
  turns: [],
  pendingApproval: null,
  sessionUsage: ZERO_USAGE,

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

  setWorkerModel: (workerModel) => set({ workerModel }),
  setApprovalMode: (approvalMode) => set({ approvalMode }),
  setAgentBusy: (agentBusy) => set({ agentBusy }),
  appendTurn: (turn) => set((s) => ({ turns: [...s.turns, turn] })),
  updateLastTurn: (patch) =>
    set((s) => {
      const turns = [...s.turns];
      const last = turns[turns.length - 1];
      if (last) turns[turns.length - 1] = patch(last);
      return { turns };
    }),
  setPendingApproval: (pendingApproval) => set({ pendingApproval }),
  addUsage: (usage) =>
    set((s) => ({
      sessionUsage: {
        promptTokens: s.sessionUsage.promptTokens + usage.promptTokens,
        completionTokens: s.sessionUsage.completionTokens + usage.completionTokens,
        totalTokens: s.sessionUsage.totalTokens + usage.totalTokens,
        estimatedCostUsd: s.sessionUsage.estimatedCostUsd + usage.estimatedCostUsd,
      },
    })),
  resetAgent: () =>
    set({ turns: [], pendingApproval: null, sessionUsage: ZERO_USAGE, agentBusy: false }),
}));
