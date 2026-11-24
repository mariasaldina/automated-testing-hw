import { expect, type Page } from "@playwright/test";
import { timeouts } from "../core/settings";
import { orderNumber } from "./order-history";
import { privacyConsent } from "./privacy-consent";

export class CheckoutPage {
  constructor(private readonly page: Page) {}

  get heading() {
    return this.page.getByRole("heading", { name: "Оформление заказа", exact: true });
  }

  get recipientStep() {
    return this.accordion.getByText("Данные получателя", { exact: true });
  }

  get deliveryStep() {
    return this.accordion.getByText("Доставка", { exact: true });
  }

  get paymentStep() {
    return this.accordion.getByText("Оплата", { exact: true });
  }

  private get accordion() {
    return this.page.locator(".checkout-content .checkout-accordion");
  }

  async continueWithSavedRecipient() {
    const cookies = this.page.getByRole("button", { name: "Согласен", exact: true });
    if (await cookies.isVisible()) await cookies.click();

    const recipient = this.page.getByPlaceholder("Введите ФИО", { exact: true });
    const phone = this.page.getByPlaceholder("+7 (900) 000-00-00", { exact: true });
    await expect.poll(async () => ({
      nameFilled: Boolean((await recipient.inputValue()).trim()),
      phoneFilled: (await phone.inputValue()).replace(/\D/g, "").length === 11,
    }), { message: "У тестового аккаунта должны быть сохранены ФИО и телефон" }).toEqual({
      nameFilled: true,
      phoneFilled: true,
    });
    await expect(this.page.getByRole("button", { name: "Подтвердить номер", exact: true }),
      "Телефон должен быть подтверждён в аккаунте до запуска теста").toBeHidden();
    await this.page.getByRole("button", { name: "Перейти к доставке", exact: true }).click();
  }

  private radio(label: RegExp, section: ".delivery" | ".payment") {
    return this.page.locator(`${section} .radio__item:visible`).filter({
      has: this.page.locator(".radio__item__label").filter({ hasText: label }),
    });
  }

  async choosePickupPoint() {
    const pickup = this.radio(/пункт[а-я]* выдачи/iu, ".delivery");
    await pickup.click();
    await expect(pickup).toHaveClass(/\bactive\b/);
    const firstStore = this.page.locator(".pickup-point-block .list__items .radio__item:visible").first();
    const address = firstStore.locator(".radio__item__label");
    await expect(address).toBeVisible();
    const selectedAddress = (await address.innerText()).trim();
    await firstStore.click();
    await expect(firstStore).toHaveClass(/\bactive\b/);
    return selectedAddress;
  }

  async acceptOrderPolicy() {
    const policy = this.page.locator('.delivery a[href*="privacy-policy"]').locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' checkbox ')][1]/..");
    const consent = privacyConsent(policy);
    await expect(consent.checkbox).toBeVisible();
    if (!(await consent.checkmark.isVisible())) await consent.checkbox.click();
    await expect(consent.checkmark).toBeVisible();
  }

  get total() {
    return this.page.locator(".checkout-content__right h2:visible")
      .filter({ hasText: /^Итого$/u }).locator("..").locator("h2 + h2");
  }

  async createOrder(rememberNumber: (number: string) => void) {
    const [response] = await Promise.all([
      this.page.waitForResponse((candidate) =>
        candidate.request().method() === "GET" &&
          new URL(candidate.url()).pathname === "/api/v1/sale/checkout/order/create/get/",
      { timeout: timeouts.action }),
      this.page.getByRole("button", { name: "Перейти к оплате", exact: true }).click(),
    ]);
    if (!response.ok()) throw new Error(`Создание заказа вернуло HTTP ${response.status()}`);
    const result: { orderID?: unknown } = await response.json();
    if (typeof result.orderID === "number" || typeof result.orderID === "string") {
      if (String(result.orderID).trim()) rememberNumber(String(result.orderID).trim());
    }
    await expect(this.page.locator(".payment__annotation")).toContainText("Ваш заказ оформлен!");
  }

  async finishWithStorePayment() {
    const storePayment = this.radio(/^Оплата в магазине$/iu, ".payment");
    await expect(storePayment, "Для выбранного заказа должна быть доступна оплата в магазине").toBeVisible();
    await storePayment.click();
    await expect(storePayment).toHaveClass(/\bactive\b/);
    await this.page.getByRole("button", { name: "Завершить оформление", exact: true }).click();
    await this.page.waitForURL((url) => /^\/personal\/checkout-final(?:\/|$)/u.test(url.pathname), {
      waitUntil: "domcontentloaded",
    });
    const heading = this.page.getByRole("heading", { name: /^Ваш заказ\s*№/iu });
    await expect(heading).toBeVisible();
    return orderNumber(await heading.textContent());
  }
}
