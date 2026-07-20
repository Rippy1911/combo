/** Agent role identifiers for orchestration (Phase C). */
export type AgentRole = "planner" | "navigator" | "validator" | "file" | "orchestrator";

export interface AgentTask {
  id: string;
  role: AgentRole;
  input: string;
  status: "pending" | "running" | "completed" | "failed";
}

/** Agent orchestrator interface stub. */
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
