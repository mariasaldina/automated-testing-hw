import { expect, type Page } from "@playwright/test";

export function orderNumber(text: string | null) {
  return text?.match(/Заказ\s*№\s*([^\s,.;]+)/iu)?.[1];
}

export class OrderHistory {
  constructor(private readonly page: Page) {}

  private get links() {
    return this.page.locator('a[href^="/personal-lk/order/"]:visible');
  }

  async open() {
    await this.page.goto("/personal-lk/orders", { waitUntil: "domcontentloaded" });
    const empty = this.page.getByText("Нет активных заказов", { exact: true });
    await this.links.first().or(empty).waitFor({ state: "visible" });
  }

  async activeOrders() {
    return this.links.evaluateAll((links) => links.flatMap((link) => {
      const number = link.textContent?.match(/Заказ\s*№\s*([^\s,.;]+)/iu)?.[1];
      const href = link.getAttribute("href");
      return number && href ? [{ number, href }] : [];
    }));
  }

  async openDetails(href: string) {
    await this.page.goto(href, { waitUntil: "domcontentloaded" });
    await this.page.getByText("Состав заказа", { exact: true }).waitFor({ state: "visible" });
  }

  get total() {
    return this.page.locator(".prop").filter({
      has: this.page.getByText("Общая сумма", { exact: true }),
    }).locator(".prop__value");
  }

  get pickup() {
    return this.page.locator(".delivery-block").filter({
      has: this.page.getByText("Способ получения", { exact: true }),
    }).locator(".value");
  }

  product(name: string) {
    return this.page.getByText(name, { exact: true }).filter({ visible: true });
  }

  get quantity() {
    return this.page.locator(".goods-title .count");
  }

  get deliveryAddress() {
    return this.page.locator(".delivery-block").filter({
      has: this.page.getByText("Адрес получателя", { exact: true }),
    }).locator(".value");
  }

  async cancel() {
    await this.page.getByRole("button", { name: "Отменить заказ", exact: true }).click();
    await this.page.locator("#orderClose").getByText("Да, отменить заказ", { exact: true }).click();
    const reasonDialog = this.page.locator("#orderCloseDetail");
    await reasonDialog.getByText(/^Не подош[её]л заказ$/iu).click();
    await reasonDialog.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(this.page.getByText(/^Ваш заказ успешно отмен[её]н\.?$/iu),
      "Сайт должен подтвердить отмену тестового заказа").toBeVisible();
  }
}
