import { errors, test as base } from "@playwright/test";
import { sensitiveRegions } from "../ui/sensitive-regions";
import { failureScreenshot, unavailableScreenshot } from "./report-attachments";
import { timeouts } from "./settings";

export { expect } from "@playwright/test";

export const test = base.extend({
  async page({ page }, use, testInfo) {
    await use(page);

    if (testInfo.status !== "failed" && testInfo.status !== "timedOut" &&
        testInfo.status !== "interrupted") {
      return;
    }

    let screenshot: Buffer;
    try {
      screenshot = await page.screenshot({
        mask: sensitiveRegions(page),
        maskColor: "#000000",
        timeout: timeouts.screenshot,
      });
    } catch (error) {
      const reason = page.isClosed()
        ? "Страница уже закрыта."
        : error instanceof errors.TimeoutError
          ? "Истёк тайм-аут снятия скриншота."
          : "Playwright не смог снять замаскированный скриншот.";
      await testInfo.attach(unavailableScreenshot, { body: reason, contentType: "text/plain" });
      return;
    }

    await testInfo.attach(failureScreenshot, { body: screenshot, contentType: "image/png" });
  },
});
