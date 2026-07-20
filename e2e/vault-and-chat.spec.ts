import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, "../extension/dist");

const PASSPHRASE = "test-passphrase-1234";
const FAKE_KEY = "sk-or-v1-fake";

async function launchExtension() {
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
  const sidePanelPage = await context.newPage();
  await sidePanelPage.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

  return { context, sidePanelPage, extensionId };
}

test.describe("Vault and chat", () => {
  test("first-run, BYOK, unlock flow", async () => {
    const { context, sidePanelPage } = await launchExtension();

    try {
      await expect(sidePanelPage.getByRole("heading", { name: "Welcome to Combo" })).toBeVisible();
      await sidePanelPage.getByRole("button", { name: "Get started" }).click();

      await expect(
        sidePanelPage.getByRole("heading", { name: "Create vault passphrase" }),
      ).toBeVisible();
      await sidePanelPage.locator("#passphrase").fill(PASSPHRASE);
      await sidePanelPage.locator("#confirm").fill(PASSPHRASE);
      await sidePanelPage.getByRole("button", { name: "Create vault" }).click();

      await expect(sidePanelPage.getByRole("heading", { name: "Combo Chat" })).toBeVisible({
        timeout: 10_000,
      });

      await sidePanelPage.getByRole("button", { name: "BYOK" }).click();
      await expect(
        sidePanelPage.getByRole("heading", { name: "Bring your own key" }),
      ).toBeVisible();
      await sidePanelPage.getByLabel("API key").fill(FAKE_KEY);
      await sidePanelPage.getByRole("button", { name: "Test Connection" }).click();
      await expect(sidePanelPage.getByText(/✗/)).toBeVisible({ timeout: 15_000 });

      await sidePanelPage.getByRole("button", { name: "Save" }).click();

      const realKey = process.env.TEST_OPENROUTER_KEY;
      if (realKey) {
        await sidePanelPage.getByRole("button", { name: "BYOK" }).click();
        await sidePanelPage.getByLabel("API key").fill(realKey);
        await sidePanelPage.getByRole("button", { name: "Test Connection" }).click();
        await expect(sidePanelPage.getByText("✓ Connected")).toBeVisible({ timeout: 15_000 });
        await sidePanelPage.getByRole("button", { name: "Save" }).click();

        await sidePanelPage
          .getByPlaceholder("Type a message…")
          .fill("reply with exactly the word: pong");
        await sidePanelPage.getByRole("button", { name: "Send" }).click();
        await expect(sidePanelPage.getByText(/pong/i)).toBeVisible({ timeout: 30_000 });
      } else {
        test.info().annotations.push({
          type: "skip-reason",
          description: "TEST_OPENROUTER_KEY not set",
        });
      }

      await sidePanelPage.getByRole("button", { name: "Lock" }).click();
      await expect(sidePanelPage.getByRole("heading", { name: "Vault locked" })).toBeVisible();

      await sidePanelPage.reload();
      await expect(sidePanelPage.getByRole("heading", { name: "Vault locked" })).toBeVisible({
        timeout: 10_000,
      });
      await sidePanelPage.getByRole("button", { name: "Unlock" }).click();
      await sidePanelPage.locator("#unlock-passphrase").fill("wrong-passphrase");
      await sidePanelPage.getByRole("button", { name: "Unlock" }).click();
      await expect(sidePanelPage.getByText("Incorrect passphrase")).toBeVisible();

      await sidePanelPage.locator("#unlock-passphrase").fill(PASSPHRASE);
      await sidePanelPage.getByRole("button", { name: "Unlock" }).click();
      await expect(sidePanelPage.getByRole("heading", { name: "Combo Chat" })).toBeVisible();

      await sidePanelPage.getByRole("button", { name: "BYOK" }).click();
      await sidePanelPage.getByLabel("API key").fill(FAKE_KEY);
      await sidePanelPage.getByRole("button", { name: "Test Connection" }).click();
      await expect(sidePanelPage.getByText(/✗/)).toBeVisible({ timeout: 15_000 });
    } finally {
      if (!context.isClosed?.()) {
        await context.close();
      }
    }
  });
});
