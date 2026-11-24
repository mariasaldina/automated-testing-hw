import { errors, type Page } from "@playwright/test";
import { timeouts } from "../core/settings";

export const straightSofasPath = "/catalog/pryamye_divany/";

export class CatalogPage {
  constructor(private readonly page: Page) {}

  private get stockFilter() {
    return this.page.locator(".checkbox:visible").filter({
      has: this.page.locator(".checkbox__label").filter({ hasText: /^В\s+наличии$/u }),
    });
  }

  async showInStock() {
    const checked = this.stockFilter.locator(".checkbox__box svg");
    const deadline = Date.now() + timeouts.action;
    while (Date.now() < deadline && !(await checked.isVisible())) {
      const timeout = Math.max(1, Math.min(timeouts.authOpenRetry, deadline - Date.now()));
      try {
        await this.stockFilter.locator(".checkbox__box").click({ timeout });
        await checked.waitFor({ state: "visible", timeout });
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
      }
    }
    await this.page.waitForURL((url) => url.searchParams.get("filter") === "avail", {
      waitUntil: "domcontentloaded",
      timeout: timeouts.action,
    });
    await checked.waitFor({ state: "visible" });
  }

  async openFirstSofa() {
    const link = this.page.locator('.desktop.cards a[href*="offer_id="]:visible').filter({
      has: this.page.locator(".card__name"),
    }).first();
    const href = await link.getAttribute("href");
    if (!href) throw new Error("На отфильтрованной странице нет карточки с предложением");

    const selected = new URL(href, this.page.url());
    const name = (await link.locator(".card__name").innerText()).trim();
    const offerId = selected.searchParams.get("offer_id");
    if (!offerId || !name) throw new Error("В карточке из каталога нет названия или идентификатора предложения");

    await link.click();
    await this.page.waitForURL((url) =>
      url.pathname === selected.pathname && url.searchParams.get("offer_id") === offerId,
    { waitUntil: "domcontentloaded" });
    return { name, offerId, pathname: selected.pathname };
  }
}
