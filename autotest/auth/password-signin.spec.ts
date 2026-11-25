import { randomUUID } from "node:crypto";
import { parameter } from "allure-js-commons";
import { requireCredential, timeouts } from "../../core/settings";
import { log } from "../../core/logging";
import { expect, test } from "../../core/test";
import { AuthDialog } from "../../ui/auth-dialog";

const loginVariants = [
  { id: "ТК-ВХ-09", title: "Вход по телефону", envKey: "PHONE", method: "Телефон" },
  { id: "ТК-ВХ-09", title: "Вход по e-mail", envKey: "EMAIL", method: "E-mail" },
] as const;

const invalidCredentialsMessage = "Неверный логин или пароль";
const requiredFieldsMessage = "Логин или пароль не заполнены";

type RejectedLoginVariant = {
  id: string;
  title: string;
  method: "Телефон" | "E-mail";
  data: () => { login: string; password: string };
  expectedError: string;
  emptyField?: "login" | "password";
};

const rejectedLoginVariants: readonly RejectedLoginVariant[] = [
  {
    id: "ТК-ВХ-10",
    title: "Вход по паролю с неизвестным логином",
    method: "E-mail",
    data: () => ({
      login: `pw-${randomUUID().slice(0, 12)}@example.com`,
      password: "TestPassword123",
    }),
    expectedError: invalidCredentialsMessage,
  },
  {
    id: "ТК-ВХ-11",
    title: "Вход по телефону с неверным паролем",
    method: "Телефон",
    data: () => ({
      login: requireCredential("PHONE"),
      password: requireCredential("PASSWORD") === "WrongPassword123"
        ? "WrongPassword456" : "WrongPassword123",
    }),
    expectedError: invalidCredentialsMessage,
  },
  {
    id: "ТК-ВХ-12",
    title: "Пустой логин при входе по паролю",
    method: "Телефон",
    data: () => ({ login: "", password: requireCredential("PASSWORD") }),
    expectedError: requiredFieldsMessage,
    emptyField: "login",
  },
  {
    id: "ТК-ВХ-12",
    title: "Пустой пароль при входе по паролю",
    method: "Телефон",
    data: () => ({ login: requireCredential("PHONE"), password: "" }),
    expectedError: requiredFieldsMessage,
    emptyField: "password",
  },
];

async function preparePasswordLogin(
  auth: AuthDialog,
  { caseId, method, login, password }: {
    caseId: string;
    method: RejectedLoginVariant["method"];
    login: string;
    password: string;
  },
) {
  await test.step("Открыть форму входа из каталога", () => auth.openFromCatalog());
  return test.step("Открыть и заполнить форму входа по паролю", async () => {
    const form = await auth.openPasswordForm();
    await form.fill(login, password);
    const loginField = method === "E-mail" ? "email" : "phone";
    log.info({ caseId, method, [loginField]: login, password }, "Заполнена форма входа по паролю");
    return form;
  });
}

function normalizeName(name: string) {
  return name.trim().replace(/\s+/gu, " ");
}

for (const { id, title, envKey, method } of loginVariants) {
  test(`${id}. ${title} с действующим паролем`, async ({ page }) => {
    const expectedName = normalizeName(requireCredential("CUSTOMER_NAME"));
    await parameter("Способ входа", method);
    const auth = new AuthDialog(page);
    const form = await preparePasswordLogin(auth, {
      caseId: id, method, login: requireCredential(envKey), password: requireCredential("PASSWORD"),
    });

    await test.step("Отправить форму и подтвердить вход нужного пользователя", async () => {
      await form.submitAndWaitForResponse();
      await expect(form.passwordField).toBeHidden();
      await expect(auth.loader).toBeHidden();
      await auth.header.profileButton("signed-in").hover();
      await expect(auth.header.logoutOption).toBeVisible();
      await expect(auth.header.profileName).toBeVisible();
      await expect.poll(async () => {
        const actualName = await auth.header.profileName.innerText({ timeout: timeouts.expect });
        return normalizeName(actualName) === expectedName;
      }, { message: "Имя в меню профиля должно совпасть с CUSTOMER_NAME, включая порядок слов" }).toBe(true);
    });
  });
}

for (const { id, title, method, data, expectedError, emptyField } of rejectedLoginVariants) {
  test(`${id}. ${title}`, async ({ page }) => {
    const credentials = data();
    await parameter("Способ входа", method);
    if (emptyField) await parameter("Пустое поле", emptyField === "login" ? "Логин" : "Пароль");
    const auth = new AuthDialog(page);
    const form = await preparePasswordLogin(auth, { caseId: id, method, ...credentials });

    await test.step("Отправить форму и проверить отказ во входе", async () => {
      await form.submit();
      await expect(form.error).toHaveText(expectedError);
      await expect(form.loginField).toBeVisible();
      await expect(form.passwordField).toBeVisible();
      if (emptyField) {
        await expect(form.emptyFieldWithError(emptyField)).toBeVisible();
      }
      await expect(auth.header.profileButton("guest"), "Должна остаться гостевая кнопка профиля").toBeVisible();
      await expect(auth.header.profileButton("signed-in"), "Не должна появиться кнопка вошедшего пользователя").toBeHidden();
    });
  });
}
