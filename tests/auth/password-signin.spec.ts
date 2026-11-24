import { randomUUID } from "node:crypto";
import test, { expect, type Page } from "@playwright/test";
import {
  getLoader,
  getPasswordForm,
  getProfileBtn,
  getProfileMenu,
  openAuthForm,
} from "./auth-helpers";
import { loginApiPath } from "../routes";

test.use({ trace: "off" });

const loginVariants = [
  { title: "Вход по телефону", envKey: "PHONE" },
  { title: "Вход по e-mail", envKey: "EMAIL" },
] as const;

const invalidCredentialsMessage = "Неверный логин или пароль";
const requiredFieldsMessage = "Логин или пароль не заполнены";

function requireCredential(name: "PHONE" | "EMAIL" | "PASSWORD") {
  const value = process.env[name];
  if (!value) throw new Error(`Необходимо задать ${name}`);
  return value;
}

async function preparePasswordLogin(
  page: Page,
  loginValue: string,
  password: string,
) {
  const login = await openAuthForm(page);
  const { loginField, passwordField, showFieldsBtn, submitBtn } =
    getPasswordForm(login);

  await test.step("Открыть и заполнить форму входа по паролю", async () => {
    await showFieldsBtn.click();
    await expect(loginField).toBeVisible();
    await expect(passwordField).toBeVisible();
    await loginField.fill(loginValue);
    await passwordField.fill(password);
  });

  return {
    loginField,
    passwordField,
    submitBtn,
    error: login
      .locator(".window__error.window__error_mod")
      .filter({ visible: true }),
  };
}

async function expectPasswordLoginError(
  form: Awaited<ReturnType<typeof preparePasswordLogin>>,
  message: string,
) {
  await expect(form.error).toHaveText(message);
  await expect(form.loginField).toBeVisible();
  await expect(form.passwordField).toBeVisible();
}

for (const { title, envKey } of loginVariants) {
  test(`ТК-ВХ-09. ${title} с действующим паролем`, async ({ page }) => {
    const { passwordField, submitBtn } = await preparePasswordLogin(
      page,
      requireCredential(envKey),
      requireCredential("PASSWORD"),
    );

    await test.step("Проверка входа с правильным паролем", async () => {
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().method() === "POST" &&
            new URL(response.url()).pathname === loginApiPath,
        ),
        submitBtn.click(),
      ]);
      await expect(passwordField).toBeHidden();
      await expect(getLoader(page)).toBeHidden();
      await getProfileBtn(page, "signed-in").hover();
      const menu = getProfileMenu(page);
      await expect(menu).toBeVisible();
      await expect(menu.getByText("Выход", { exact: true })).toBeVisible();
    });
  });
}

test("ТК-ВХ-10. Вход по паролю с неизвестным логином", async ({ page }) => {
  const unknownEmail = `pw-${randomUUID().slice(0, 12)}@example.com`;
  const form = await preparePasswordLogin(page, unknownEmail, "TestPassword123");

  await form.submitBtn.click();
  await expectPasswordLoginError(form, invalidCredentialsMessage);
});

test("ТК-ВХ-11. Вход по телефону с неверным паролем", async ({ page }) => {
  const phone = requireCredential("PHONE");
  const password = requireCredential("PASSWORD");
  const wrongPassword =
    password === "WrongPassword123" ? "WrongPassword456" : "WrongPassword123";
  const form = await preparePasswordLogin(page, phone, wrongPassword);

  await form.submitBtn.click();
  await expectPasswordLoginError(form, invalidCredentialsMessage);
});

const missingFieldVariants = [
  { title: "Пустой логин", field: "login" },
  { title: "Пустой пароль", field: "password" },
] as const;

for (const { title, field } of missingFieldVariants) {
  test(`ТК-ВХ-12. ${title} при входе по паролю`, async ({ page }) => {
    const loginValue = field === "login" ? "" : requireCredential("PHONE");
    const password = field === "password" ? "" : requireCredential("PASSWORD");
    const form = await preparePasswordLogin(page, loginValue, password);

    await form.submitBtn.click();
    await expectPasswordLoginError(form, requiredFieldsMessage);
    const emptyField = field === "login" ? form.loginField : form.passwordField;
    await expect(emptyField).toHaveClass(/(?:^|\s)window__input_error(?:\s|$)/);
  });
}
