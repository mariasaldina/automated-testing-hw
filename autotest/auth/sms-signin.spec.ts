import { randomInt } from "node:crypto";
import type { Page, Request } from "@playwright/test";
import { parameter } from "allure-js-commons";
import { smsHttpSummary } from "../../core/report-attachments";
import { requireCredential, settings, timeouts } from "../../core/settings";
import { expect, test } from "../../core/test";
import { AuthDialog } from "../../ui/auth-dialog";
import type { SmsLoginForm } from "../../ui/sms-login-form";

async function prepareSmsLogin(auth: AuthDialog) {
  const phone = requireCredential("PHONE");
  const nationalNumber = phone.replace(/\D/g, "").replace(/^[78](?=\d{10}$)/, "");
  if (nationalNumber.length !== 10) {
    throw new Error("PHONE должен содержать российский номер телефона");
  }

  await test.step("Открыть форму входа из каталога", () => auth.openFromCatalog());
  return test.step("Открыть SMS-вход и заполнить номер", async () => {
    const form = await auth.openSmsForm();
    await form.fillPhone(nationalNumber);
    await expect.poll(
      () => form.hasPhone(nationalNumber),
      { message: "Поле SMS-входа должно сохранить все цифры после применения маски" },
    ).toBe(true);
    return form;
  });
}

async function requestSmsCode(page: Page, form: SmsLoginForm) {
  return test.step("Запросить SMS-код", async () => {
    const { checkbox, checkmark } = form.consent;
    await expect(checkbox).toBeVisible();
    if (!(await checkmark.isVisible())) await checkbox.click();
    await expect(checkmark).toBeVisible();
    await expect(form.blockedRequestButton).toBeHidden();

    const origin = new URL(page.url()).origin;
    const posts: Request[] = [];
    const recordSmsRequest = (request: Request) => {
      const url = new URL(request.url());
      if (
        request.method() === "POST" &&
        url.origin === origin &&
        url.pathname === "/api_vue/authentication/authByPhone/"
      ) {
        posts.push(request);
      }
    };

    page.on("request", recordSmsRequest);
    try {
      await form.requestCodeButton.click();
      await expect(
        form.firstCodeField.or(form.requestError).or(form.captchaChallenge).filter({ visible: true }).first(),
        "После «Получить код» ожидается поле ввода кода, ошибка отправки или окно CAPTCHA",
      ).toBeVisible({ timeout: timeouts.smsRequest });

      if (await form.captchaChallenge.first().isVisible()) return "captcha";
      if (!(await form.firstCodeField.isVisible())) {
        throw new Error("Сайт показал ошибку на форме запроса SMS-кода");
      }
      return "code";
    } catch (error) {
      await test.info().attach(smsHttpSummary, {
        contentType: "application/json",
        body: JSON.stringify({
          count: posts.length,
          outcomes: posts.map((request) =>
            request.existingResponse()?.status() ??
            (request.failure() ? "сбой сети" : "нет ответа"),
          ),
        }),
      });
      if (posts.length === 0) {
        throw new Error("Сайт не отправил запрос SMS после «Получить код». Перед отправкой сайт запускает SmartCaptcha.", { cause: error });
      }
      throw error;
    } finally {
      page.off("request", recordSmsRequest);
    }
  });
}

test.describe("Вход с отправкой SMS", () => {
  test.describe.configure({ retries: 0, timeout: timeouts.smsTest });
  test.skip(!settings.liveSms, "Требуется явный запуск с RUN_LIVE_SMS=1");

  test("ТК-ВХ-02. Вход по SMS с неверным кодом", async ({ page }) => {
    await parameter("Способ входа", "SMS");
    const auth = new AuthDialog(page);
    const form = await prepareSmsLogin(auth);
    const result = await requestSmsCode(page, form);
    test.skip(result === "captcha", "Сайт показал окно SmartCaptcha при запросе SMS-кода");
    const code = String(randomInt(10_000)).padStart(4, "0");

    await test.step("Ввести один случайный четырёхзначный код", async () => {
      await expect(form.codeFields).toHaveCount(4);
      await form.enterCode(code);
      await expect(form.codeError).toHaveText(/^(?!\s*false\s*$)\s*\S/);
      await expect(form.codeForm).toBeVisible();
      await expect(auth.header.profileButton("signed-in")).toBeHidden();
    });
  });
});

test("ТК-ВХ-14. Блокировка запроса SMS при снятом флажке согласия", async ({ page }) => {
  await parameter("Способ входа", "SMS");
  const form = await prepareSmsLogin(new AuthDialog(page));

  await test.step("Попытаться получить код без согласия", async () => {
    const { checkbox, checkmark, highlight } = form.consent;
    await expect(checkbox).toBeVisible();
    if (await checkmark.isVisible()) await checkbox.click();
    await expect(checkmark).toBeHidden();
    await expect(form.blockedRequestButton).toBeVisible();
    await form.requestCodeButton.click();

    await expect(highlight).toBeVisible();
    await expect(form.blockedRequestButton).toBeVisible();
    await expect(form.codeForm).toBeHidden();
  });
});
