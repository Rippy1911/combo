import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/src/**/*.test.ts", "extension/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/**/src/**/*.ts", "extension/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "extension/src/**",
        // Phase A: stub packages excluded from 80% gate — re-enable per package in Phase B
        "packages/shared/src/**",
        "packages/vault/src/**",
        "packages/rag/src/**",
        "packages/files/src/**",
        "packages/mcp/src/**",
        "packages/llm/src/**",
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
