import { expect, type Page } from "@playwright/test";
import { timeouts } from "../core/settings";

export function orderNumber(text: string | null) {
  return text?.match(/Заказа?\s*№\s*([^\s,.;]+)/iu)?.[1];
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
    await this.page.goto(href, { waitUntil: "commit" });
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
    const openCancellation = this.page.getByRole("button", { name: "Отменить заказ", exact: true });
    const confirmationTitle = this.page.getByText("Вы уверены, что хотите отменить заказ?", { exact: true })
      .filter({ visible: true });
    const confirm = this.page.locator("button.button:visible").filter({
      has: this.page.getByText("Да, отменить заказ", { exact: true }),
    });
    await expect(async () => {
      if (!(await confirm.isVisible()) && !(await confirmationTitle.isVisible())) {
        await openCancellation.click({ timeout: timeouts.expect });
      }
      await expect(confirm, "После «Отменить заказ» должно открыться окно подтверждения").toBeVisible();
    }).toPass({ timeout: timeouts.orderSync });
    const reasonsResponse = this.page.waitForResponse((response) => {
      const request = response.request();
      if (request.method() !== "POST" || new URL(response.url()).pathname !== "/api_vue/personal/") return false;
      try {
        return request.postDataJSON()?.action === "getReasonsForClose";
      } catch {
        return false;
      }
    }, { timeout: timeouts.orderSync }).catch(() => null);
    await confirm.click();

    const reasonTitle = this.page.getByText("Пожалуйста, укажите причину отмены заказа", { exact: true });
    const reasonDialog = this.page.locator("#orderCloseDetail")
      .or(this.page.locator(".window, .l-pop").filter({ has: reasonTitle }));
    const reasons = reasonDialog.locator(".input-group .input-radio:visible");
    try {
      await expect(reasons.first(), "Сайт должен загрузить список причин отмены заказа")
        .toBeVisible({ timeout: timeouts.orderSync });
    } catch (cause) {
      const response = await reasonsResponse;
      const data = await response?.json().catch(() => null);
      const status = response ? `HTTP ${response.status()}, success=${data?.success === true}, ` +
        `вариантов: ${Array.isArray(data?.reasons) ? data.reasons.length : 0}` : "ответ не получен";
      throw new Error(`Список причин отмены не появился (${status}). ` +
        `Подтверждение открыто: ${await confirmationTitle.isVisible()}, ` +
        `окно причин открыто: ${await reasonTitle.filter({ visible: true }).isVisible()}.`, { cause });
    }

    const labels = this.page.locator(".input-radio__label");
    const unsuitable = reasons.filter({ has: labels.filter({ hasText: /^Не подош[её]л (?:товар|заказ)$/iu }) });
    const other = reasons.filter({ has: labels.filter({ hasText: /^Другое$/iu }) });
    const reason = await unsuitable.isVisible() ? unsuitable : other;
    await expect(reason, "Среди причин отмены должна быть причина «Не подошёл товар» или «Другое»").toBeVisible();
    await reason.click();
    await expect(reason, "Причина отмены должна быть выбрана").toHaveClass(/\binput-radio_active\b/);

    const description = reasonDialog.locator(".input-group__textarea textarea:visible");
    if (await description.isVisible()) await description.fill("Тестовый заказ");
    await reasonDialog.locator("button.button:visible")
      .filter({ has: this.page.getByText("Отправить", { exact: true }) }).click();
    await expect(this.page.getByText(/^Ваш заказ успешно отмен[её]н\.?$/iu),
      "Сайт должен подтвердить отмену тестового заказа").toBeVisible({ timeout: timeouts.orderSync });
  }
}
