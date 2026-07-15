/** MCP transport types (client + server in Phase C). */
export type McpTransport = "stdio" | "sse" | "chrome-native";

export interface McpServerConfig {
  id: string;
  name: string;
  transport: McpTransport;
  endpoint?: string;
}

/** MCP client interface stub. */
export interface McpClient {
  connect(config: McpServerConfig): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<string[]>;
}

export const MCP_SDK_TARGET = "@modelcontextprotocol/sdk" as const;

export function getMcpSdkTarget(): typeof MCP_SDK_TARGET {
  return MCP_SDK_TARGET;
}
