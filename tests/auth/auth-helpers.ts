import test, { expect, type Locator, type Page } from "@playwright/test";
import { catalogUrl } from "../routes";

export async function openAuthForm(page: Page) {
  const login = getLoginForm(page);
  await test.step("Открыть форму входа из каталога", async () => {
    await page.goto(catalogUrl);
    await page.waitForTimeout(3000);
    await getProfileBtn(page, "guest").click();
    await expect(
      login.getByRole("button", { name: "Войти по смс" }),
    ).toBeVisible();
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

export function getPrivacyConsentCheckbox(login: Locator) {
  const consent = login.locator(".window__form.login-options .checkbox");
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
