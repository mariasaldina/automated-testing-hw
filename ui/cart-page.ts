import type { Locator, Page } from "@playwright/test";

export const cartPath = "/personal/order/";
export const checkoutPath = "/personal/checkout/";

export class CartPage {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.goto(cartPath, { waitUntil: "domcontentloaded" });
  }

  get heading() {
    return this.page.getByRole("heading", { name: "Корзина", exact: true });
  }

  get emptyMessage() {
    return this.page.getByText("В корзине пока нет товаров", { exact: true });
  }

  get rows() {
    return this.page.locator(".basket-card:visible");
  }

  rowFor(offer: { pathname: string; offerId: string }) {
    const href = `${offer.pathname}?offer_id=${encodeURIComponent(offer.offerId)}`;
    const link = this.page.locator(`a[href=${JSON.stringify(href)}]`);
    return new CartItem(this.rows.filter({ has: link }), link);
  }

  get checkoutButton() {
    return this.page.getByRole("button", { name: "Перейти к оформлению", exact: true });
  }

  get total() {
    return this.page.locator(".total__final__sum:visible");
  }

  async openCheckout() {
    await this.checkoutButton.click();
    await this.page.waitForURL((url) => url.pathname === checkoutPath, {
      waitUntil: "domcontentloaded",
    });
  }

  async removeSelected() {
    await this.page.getByText("Удалить выбранные", { exact: true }).click();
    await this.page.getByText("Да, удалить", { exact: true }).filter({ visible: true }).click();
  }
}

class CartItem {
  constructor(readonly row: Locator, private readonly link: Locator) {}

  get name() {
    return this.row.locator(".basket-card__right__features").locator(this.link);
  }

  get price() {
    return this.row.locator(".new-old-prices .new");
  }

  get quantity() {
    return this.row.locator("input.grayBorder");
  }

  private get checkbox() {
    return this.row.locator(".checkbox__box");
  }

  get checkmark() {
    return this.checkbox.locator("svg");
  }

  async select() {
    if (!(await this.checkmark.isVisible())) await this.checkbox.click();
  }
}
