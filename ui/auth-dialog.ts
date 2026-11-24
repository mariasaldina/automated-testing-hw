import { performance } from "node:perf_hooks";
import { errors, type Locator, type Page } from "@playwright/test";
import { timeouts } from "../core/settings";
import { straightSofasPath } from "./catalog-page";
import { Header } from "./header";
import { privacyConsent } from "./privacy-consent";
import { SmsLoginForm } from "./sms-login-form";

const loginApiPath = "/api_vue/authentication/authByLogin/";

export class AuthDialog {
  private readonly dialog: Locator;
  readonly header: Header;

  constructor(private readonly page: Page) {
    this.dialog = page.locator("#login");
    this.header = new Header(page);
  }

  private get smsOption() {
    return this.dialog.getByRole("button", { name: "Войти по смс", exact: true });
  }

  async openFromCatalog() {
    await this.page.goto(straightSofasPath, { waitUntil: "domcontentloaded" });
    const profile = this.header.profileButton("guest");
    const deadline = performance.now() + timeouts.authForm;
    const remaining = () => Math.ceil(deadline - performance.now());
    let attempts = 0;

    while (remaining() > 0) {
      if (await this.smsOption.isVisible()) return;
      const clickTimeout = Math.min(remaining(), timeouts.authOpenRetry, timeouts.action);
      if (clickTimeout <= 0) break;

      try {
        attempts++;
        await profile.click({ timeout: clickTimeout });
        const waitTimeout = Math.min(remaining(), timeouts.authOpenRetry);
        if (waitTimeout <= 0) break;
        await this.smsOption.waitFor({ state: "visible", timeout: waitTimeout });
        return;
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
      }
    }

    if (await this.smsOption.isVisible()) return;
    throw new Error(
      `Форма входа не показала кнопку «Войти по смс» за ${timeouts.authForm} мс. Попыток открытия через профиль гостя: ${attempts}.`,
    );
  }

  get consent() {
    return privacyConsent(this.dialog.locator(".window__form.login-options"));
  }

  async openPasswordForm() {
    await this.dialog.getByRole("button", {
      name: "Войти с логином и паролем",
      exact: true,
    }).click();
    return new PasswordLoginForm(this.page, this.dialog);
  }

  async openSmsForm() {
    await this.smsOption.click();
    return new SmsLoginForm(this.dialog);
  }

  get loader() {
    return this.page.locator(".block-preloader");
  }
}

class PasswordLoginForm {
  constructor(private readonly page: Page, private readonly dialog: Locator) {}

  get loginField() {
    return this.dialog.locator('input[name="login"].window__input');
  }

  get passwordField() {
    return this.dialog.locator('input[name="password"].window__input');
  }

  get error() {
    return this.dialog.locator(".window__error.window__error_mod").filter({ visible: true });
  }

  emptyFieldWithError(field: "login" | "password") {
    const input = field === "login" ? this.loginField : this.passwordField;
    return input.and(this.dialog.locator(".window__input_error"));
  }

  async fill(login: string, password: string) {
    await this.loginField.fill(login);
    await this.passwordField.fill(password);
  }

  async submit() {
    await this.dialog.locator(".window__submit .js-auth-btn").click();
  }

  async submitAndWaitForResponse() {
    const { origin } = new URL(this.page.url());
    await Promise.all([
      this.page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return response.request().method() === "POST" &&
            url.origin === origin && url.pathname === loginApiPath;
        },
        { timeout: timeouts.authResponse },
      ),
      this.submit(),
    ]);
  }
}
