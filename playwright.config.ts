import { defineConfig } from "@playwright/test";
import { settings, timeouts } from "./core/settings";

process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

export default defineConfig({
  testDir: "./autotest",
  timeout: timeouts.test,
  expect: { timeout: timeouts.expect },
  reporter: process.argv.includes("--list") ? [["list"]] : [["./core/reporting.ts"]],
  use: {
    channel: settings.browserChannel,
    baseURL: settings.baseURL,
    actionTimeout: timeouts.action,
    navigationTimeout: timeouts.navigation,
    trace: "off",
    video: "off",
    screenshot: "off",
  },
});
