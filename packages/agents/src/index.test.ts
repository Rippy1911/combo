import { describe, expect, it } from "vitest";
import { listAgentRoles } from "./index.js";

describe("@combo/agents", () => {
  it("lists all agent roles", () => {
    expect(listAgentRoles()).toHaveLength(5);
    expect(listAgentRoles()).toContain("orchestrator");
  });
});
