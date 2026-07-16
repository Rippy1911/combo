import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, "../extension/dist");
const REAL_KEY = process.env.TEST_OPENROUTER_KEY;
const PASSPHRASE = "combo-test-passphrase-123";

async function loadSidePanel() {
  const context = await chromium.launchPersistentContext("", {
    headless: false,
    args: [
      "--headless=new",
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }
  const extensionId = serviceWorker.url().split("/")[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);
  return { context, page };
}

/** First-run: set the passphrase and land on the chat view. */
async function firstRunToChat(page: import("@playwright/test").Page) {
  await expect(page.getByRole("heading", { name: "Welcome to Combo" })).toBeVisible();
  await page.getByTestId("first-run-passphrase").fill(PASSPHRASE);
  await page.getByTestId("first-run-confirm").fill(PASSPHRASE);
  await page.getByTestId("first-run-submit").click();
  await expect(page.getByTestId("chat-input")).toBeVisible();
}

test.describe("Combo vault + chat (Phase B)", () => {
  test("first-run: set passphrase → reach chat view", async () => {
    const { context, page } = await loadSidePanel();
    try {
      await firstRunToChat(page);
      await expect(page.getByTestId("byok-button")).toBeVisible();
      await expect(page.getByTestId("model-input")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("BYOK fake key → test connection shows 401", async () => {
    const { context, page } = await loadSidePanel();
    try {
      await firstRunToChat(page);
      await page.getByTestId("byok-button").click();
      await page.getByTestId("byok-key-input").fill("sk-or-v1-fake");
      await page.getByTestId("byok-test-connection").click();
      // OpenRouter GET /key rejects a fake key with HTTP 401.
      await expect(page.getByTestId("byok-status")).toContainText("401", { timeout: 30_000 });
    } finally {
      await context.close();
    }
  });

  test("real BYOK key → send message → reply contains pong", async () => {
    test.skip(!REAL_KEY, "TEST_OPENROUTER_KEY not set; skipping live chat test");
    const { context, page } = await loadSidePanel();
    try {
      await firstRunToChat(page);
      await page.getByTestId("byok-button").click();
      await page.getByTestId("byok-key-input").fill(REAL_KEY as string);
      await page.getByTestId("byok-save").click();
      // Dialog closes on save; wait for the chat input to be focused again.
      await expect(page.getByTestId("byok-key-input")).toBeHidden();

      await page.getByTestId("chat-input").fill("reply with exactly the word: pong");
      await page.getByTestId("send-button").click();

      // The assistant turn must contain "pong" once streaming completes.
      await expect(page.getByTestId("message-assistant").filter({ hasText: "pong" })).toBeVisible({
        timeout: 60_000,
      });
    } finally {
      await context.close();
    }
  });
});
