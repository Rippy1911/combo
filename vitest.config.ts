import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/src/**/*.test.{ts,tsx}", "extension/src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "packages/vault/src/**/*.ts",
        "packages/llm/src/**/*.ts",
        "packages/files/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "extension/src/**",
        // Phase B: stub packages still excluded from the 80% gate
        "packages/shared/src/**",
        "packages/rag/src/**",
        "packages/mcp/src/**",
        "packages/agents/src/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    benchmark: {
      include: ["**/*.bench.ts"],
    },
  },
});
