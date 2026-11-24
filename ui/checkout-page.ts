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
    return this.recipientSection.getByText("Данные получателя", { exact: true });
  }

  private get recipientSection() {
    return this.accordion.locator(".accordion-item").filter({
      has: this.page.getByText("Данные получателя", { exact: true }),
    });
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

    const section = this.recipientSection;
    const recipient = section.locator('input[name="name"]');
    const phone = section.locator('input[name="phone"]');
    const savedDetails = section.locator(".requisites-completed:visible");
    const loadError = this.page.locator(".checkout-error:visible");
    await expect(recipient.filter({ visible: true }).or(savedDetails).or(loadError),
      "Оформление должно загрузить форму или сохранённые данные получателя")
      .toBeVisible({ timeout: timeouts.orderSync });
    await expect(loadError, "Сайт сообщил об ошибке загрузки оформления").toBeHidden();

    if (await savedDetails.isVisible()) {
      await section.locator(".accordion-title__edit:visible").filter({ hasText: /^Изменить данные$/u }).click();
    }
    await expect(recipient, "Должно быть видно поле ФИО получателя")
      .toBeVisible({ timeout: timeouts.orderSync });
    await expect(phone, "Должно быть видно поле телефона получателя").toBeVisible();
    await expect.poll(async () => ({
      nameFilled: Boolean((await recipient.inputValue()).trim()),
      phoneFilled: (await phone.inputValue()).replace(/\D/g, "").length === 11,
    }), { message: "У тестового аккаунта должны быть сохранены ФИО и телефон", timeout: timeouts.action }).toEqual({
      nameFilled: true,
      phoneFilled: true,
    });
    await expect(this.page.getByRole("button", { name: "Подтвердить номер", exact: true }),
      "Телефон должен быть подтверждён в аккаунте до запуска теста").toBeHidden();
    await section.getByRole("button", { name: "Перейти к доставке", exact: true }).click();
  }

  private radio(label: RegExp, section: ".delivery" | ".payment") {
    return this.page.locator(`${section} .radio__item:visible`).filter({
      has: this.page.locator(".radio__item__label").filter({ hasText: label }),
    });
  }

  async choosePickupPoint() {
    const pickup = this.radio(/пункт[а-яё]*\s+выдачи/iu, ".delivery");
    await expect(pickup, "В способах получения должен быть пункт выдачи")
      .toBeVisible({ timeout: timeouts.orderSync });
    if (!(await pickup.evaluate((item) => item.classList.contains("active")))) {
      await pickup.click();
    }
    await expect(pickup).toHaveClass(/\bactive\b/);

    const pickupBlock = this.page.locator(".delivery__description .pickup-point-block");
    await expect(pickupBlock, "Должен загрузиться блок пунктов выдачи для выбранного способа получения")
      .toBeVisible({ timeout: timeouts.orderSync });
    const firstStore = pickupBlock.locator(".list__items .radio__item:visible").first();
    const listAddress = firstStore.locator(".radio__item__label:visible");
    const savedAddress = pickupBlock.locator(".pickup-point-block__store__content__address:visible");
    const address = listAddress.or(savedAddress);
    await expect(address, "Сайт должен показать доступный адрес ПВЗ для выбранного товара и региона")
      .toBeVisible({ timeout: timeouts.orderSync });

    if (await listAddress.isVisible()) {
      if (!(await firstStore.evaluate((item) => item.classList.contains("active")))) {
        await firstStore.click();
      }
      await expect(firstStore, "Первый доступный ПВЗ должен быть выбран").toHaveClass(/\bactive\b/);
    }
    const selectedAddress = (await address.innerText()).trim();
    if (!selectedAddress) throw new Error("У выбранного ПВЗ отсутствует адрес");
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
    await this.page.getByRole("button", { name: "Перейти к оплате", exact: true }).click();
    await expect(this.page.locator(".payment__annotation"), "Сайт должен подтвердить создание заказа")
      .toContainText("Ваш заказ оформлен!", { timeout: timeouts.orderSync });

    const paymentTitle = this.accordion.locator(".accordion-title__text")
      .filter({ hasText: /^Оплата заказа\s*№/iu });
    if (await paymentTitle.isVisible()) {
      const number = orderNumber(await paymentTitle.textContent());
      if (number) rememberNumber(number);
    }
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
