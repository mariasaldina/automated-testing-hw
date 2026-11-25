import type { Locator } from "@playwright/test";
import { privacyConsent } from "./privacy-consent";

const phonePlaceholder = "+7 (___) ___-__-__";

export class SmsLoginForm {
  private readonly phoneForm: Locator;
  readonly codeForm: Locator;

  constructor(dialog: Locator) {
    const page = dialog.page();
    this.phoneForm = dialog.locator(".window__form").filter({
      has: page.getByPlaceholder(phonePlaceholder, { exact: true }),
      visible: true,
    });
    this.codeForm = dialog.locator(".window__form").filter({
      has: page.locator("input#input0"),
    });
  }

  private get phoneInput() {
    return this.phoneForm.getByPlaceholder(phonePlaceholder, { exact: true });
  }

  get consent() {
    return privacyConsent(this.phoneForm);
  }

  get requestCodeButton() {
    return this.phoneForm.getByText("Получить код", { exact: true });
  }

  get blockedRequestButton() {
    return this.requestCodeButton.and(this.phoneForm.locator(".grayscale"));
  }

  get requestError() {
    return this.phoneForm.locator(".window__error").filter({ hasText: /\S/, visible: true });
  }

  get captchaChallenge() {
    return this.phoneForm.page().locator(".SmartCaptcha-Overlay_visible:visible");
  }

  get firstCodeField() {
    return this.codeForm.locator("input#input0");
  }

  get codeFields() {
    return this.codeForm.locator("input.window__input_short[type=tel]");
  }

  get codeError() {
    return this.codeForm.locator(".window__error_mod").filter({ visible: true });
  }

  async fillPhone(nationalNumber: string) {
    const formatted = nationalNumber.replace(/^(\d{3})(\d{3})(\d{2})(\d{2})$/, "+7 ($1) $2-$3-$4");
    await this.phoneInput.fill(formatted);
  }

  async hasPhone(nationalNumber: string) {
    const digits = (await this.phoneInput.inputValue()).replace(/\D/g, "");
    return digits === `7${nationalNumber}`;
  }

  async enterCode(code: string) {
    for (const [index, digit] of [...code].entries()) {
      await this.codeFields.nth(index).press(digit);
    }
  }
}
