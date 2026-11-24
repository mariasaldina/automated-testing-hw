import type { Page } from "@playwright/test";
import { timeouts } from "../core/settings";

export class ProductPage {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.locator("main h1:visible");
  }

  get price() {
    return this.page.locator("main .mb-6 .new-old-prices .new:visible").first();
  }

  get addButton() {
    return this.page.locator("main button.to-card-btn:visible")
      .or(this.page.locator("main").getByRole("button", { name: "Добавить в корзину", exact: true }))
      .first();
  }

  async addToCart() {
    const { origin } = new URL(this.page.url());
    const [response] = await Promise.all([
      this.page.waitForResponse((candidate) => {
        const url = new URL(candidate.url());
        return url.origin === origin && url.pathname === "/api_vue/basket/add/" &&
          candidate.request().method() === "POST";
      }, { timeout: timeouts.action }),
      this.addButton.click(),
    ]);
    if (!response.ok()) throw new Error(`Добавление товара в корзину вернуло HTTP ${response.status()}`);
  }
}
