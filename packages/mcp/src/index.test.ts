import { describe, expect, it } from "vitest";
import { getMcpSdkTarget } from "./index.js";

describe("@combo/mcp", () => {
  it("exports MCP SDK target", () => {
    expect(getMcpSdkTarget()).toBe("@modelcontextprotocol/sdk");
  });
});
