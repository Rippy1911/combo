import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, "extension/dist");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-extension",
      use: {
        // Extension path injected in smoke test via launch args
        extensionPath,
      },
    },
  ],
});
