import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/**/src/**/*.test.ts",
      "packages/**/tests/**/*.test.ts",
      "extension/src/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/**/src/**/*.ts", "extension/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.bench.ts",
        "**/*.d.ts",
        "extension/src/**",
        "packages/shared/src/**",
        "packages/mcp/src/**",
        "packages/agents/src/**",
        "packages/llm/src/anthropic.ts",
        "packages/llm/src/openai.ts",
        "packages/llm/src/ollama.ts",
        "packages/llm/src/groq.ts",
        "packages/llm/src/cerebras.ts",
        "packages/vault/src/constants.ts",
        "packages/vault/src/types.ts",
        "packages/vault/src/index.ts",
        "packages/rag/src/index.ts",
        "packages/files/src/types.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
    benchmark: {
      include: ["**/*.bench.ts"],
    },
  },
});
