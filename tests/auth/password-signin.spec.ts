import test, { expect } from "@playwright/test";
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
];

for (const { title, envKey } of loginVariants) {
  test(`ТК-ВХ-09. ${title} с действующим паролем`, async ({ page }) => {
    const loginValue = process.env[envKey];
    const password = process.env.PASSWORD;

    if (!loginValue) throw new Error(`Необходимо задать ${envKey} в .env`);
    if (!password) throw new Error("Необходимо задать PASSWORD в .env");

    const login = await openAuthForm(page);
    const { loginField, passwordField, showFieldsBtn, submitBtn } =
      getPasswordForm(login);

    await test.step("Проверка видимости и заполнения полей формы входа", async () => {
      await expect(showFieldsBtn).toBeVisible();
      await showFieldsBtn.click();
      await expect(loginField).toBeVisible();
      await expect(passwordField).toBeVisible();
      await loginField.fill(loginValue);
      await passwordField.fill(password);
      await expect(submitBtn).toBeVisible();
    });

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
