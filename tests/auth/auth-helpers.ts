import test, { errors, expect, type Locator, type Page } from "@playwright/test";
import { catalogUrl } from "../routes";

export async function openAuthForm(page: Page) {
  const login = getLoginForm(page);
  const profile = getProfileBtn(page, "guest");
  const smsButton = login.getByRole("button", { name: "Войти по смс", exact: true });

  await test.step("Открыть форму входа из каталога", async () => {
    await page.goto(catalogUrl);
    await page.waitForTimeout(3000);
    await profile.click();

    try {
      await smsButton.waitFor({ state: "visible", timeout: 5000 });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;

      await test.step("Повторить открытие, если форма не появилась", async () => {
        if (!(await smsButton.isVisible())) {
          await profile.click();
        }
        await expect(smsButton).toBeVisible();
      });
    }
  });

  return login;
}

export function getLoginForm(page: Page) {
  return page.locator("#login");
}

export function getProfileBtn(page: Page, state: "guest" | "signed-in") {
  const icon = state === "guest" ? "lk-black.svg" : "lk-black-filled.svg";

  return page.locator("header .l-head-informer__link").filter({
    has: page.locator(`img[src="/images/bottom-menu/${icon}"]`),
    visible: true,
  });
}

export function getProfileMenu(page: Page) {
  return page.locator(".l-head-informer > .user-content:visible");
}

export function getLoader(page: Page) {
  return page.locator(".block-preloader");
}

export function getPrivacyConsentCheckbox(form: Locator) {
  const consent = form.locator(".checkbox").filter({ visible: true });
  const checkbox = consent.locator(".checkbox__box");
  const checkmark = checkbox.locator("svg");
  const label = consent.locator(".checkbox__label");
  return { checkbox, checkmark, label };
}

export function getPasswordForm(login: Locator) {
  const showFieldsBtn = login.getByRole("button", {
    name: "Войти с логином и паролем",
    exact: true,
  });
  const loginField = login.locator('input[name="login"].window__input');
  const passwordField = login.locator('input[name="password"].window__input');
  const submitBtn = login.locator(".window__submit .js-auth-btn");
  return { loginField, passwordField, showFieldsBtn, submitBtn };
}
