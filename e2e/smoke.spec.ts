import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPath = path.join(__dirname, "../extension/dist");

test.describe("Combo extension smoke", () => {
  test("side panel renders Combo is alive", async () => {
    const context = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        "--headless=new",
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    try {
      let serviceWorker = context.serviceWorkers()[0];
      if (!serviceWorker) {
        serviceWorker = await context.waitForEvent("serviceworker");
      }

      const extensionId = serviceWorker.url().split("/")[2];
      const sidePanelPage = await context.newPage();
      await sidePanelPage.goto(`chrome-extension://${extensionId}/src/sidepanel/index.html`);

      await expect(sidePanelPage.getByRole("heading", { name: "Welcome to Combo" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
