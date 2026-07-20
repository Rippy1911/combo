/** Agent role identifiers for orchestration (Phase C multi-role target). */
export type AgentRole = "planner" | "navigator" | "validator" | "file" | "orchestrator";

export interface AgentTask {
  id: string;
  role: AgentRole;
  input: string;
  status: "pending" | "running" | "completed" | "failed";
}

/** Agent orchestrator interface stub (multi-role dispatch — Phase C follow-up). */
export interface AgentOrchestrator {
  dispatch(task: AgentTask): Promise<AgentTask>;
  getStatus(taskId: string): Promise<AgentTask | null>;
}

export const AGENT_ROLES: readonly AgentRole[] = [
  "planner",
  "navigator",
  "validator",
  "file",
  "orchestrator",
] as const;

export function listAgentRoles(): readonly AgentRole[] {
  return AGENT_ROLES;
}

// ── Phase C: real tool-calling agent loop (single orchestrator + worker) ─────

export { AGENT_TOOLS, parseToolArguments, rowsToCsv, toolArgsToContentRequest } from "./tools.js";
export {
  AgentLoop,
  type ApprovalMode,
  type AgentEvent,
  type AgentRunOptions,
  type AgentRunResult,
  type BrowserBridge,
  type PreviewPayload,
  type Usage,
} from "./loop.js";
