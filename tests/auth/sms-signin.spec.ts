import { randomInt } from "node:crypto";
import { expect, test, type Page, type Request } from "@playwright/test";
import {
  getPrivacyConsentCheckbox,
  getProfileBtn,
  openAuthForm,
} from "./auth-helpers";

test.use({ trace: "off" });

async function openSmsForm(page: Page) {
  const phone = process.env.PHONE;
  if (!phone) throw new Error("Необходимо задать PHONE");
  const nationalNumber = phone.replace(/\D/g, "").replace(/^[78](?=\d{10}$)/, "");
  if (nationalNumber.length !== 10) {
    throw new Error("PHONE должен содержать российский номер телефона");
  }

  const login = await openAuthForm(page);
  await login.getByRole("button", { name: "Войти по смс", exact: true }).click();

  const phonePlaceholder = "+7 (___) ___-__-__";
  const phoneForm = login.locator(".window__form").filter({
    has: page.getByPlaceholder(phonePlaceholder, { exact: true }),
    visible: true,
  });
  const phoneInput = phoneForm.getByPlaceholder(phonePlaceholder, { exact: true });
  const consent = getPrivacyConsentCheckbox(phoneForm);
  const expectedPhoneDigits = `7${nationalNumber}`;
  await phoneInput.pressSequentially(nationalNumber);
  await expect
    .poll(
      async () =>
        (await phoneInput.inputValue()).replace(/\D/g, "") === expectedPhoneDigits,
      { message: "Поле SMS-входа должно сохранить все цифры после применения маски" },
    )
    .toBe(true);

  return {
    phoneForm,
    consent,
    requestCodeButton: phoneForm.getByText("Получить код", { exact: true }),
    codeForm: login.locator(".window__form").filter({
      has: page.locator("input#input0"),
    }),
  };
}

async function requestSmsCode(page: Page) {
  const { phoneForm, consent, requestCodeButton, codeForm } = await openSmsForm(page);

  await test.step("Запросить SMS-код", async () => {
    await expect(consent.checkbox).toBeVisible();
    if (!(await consent.checkmark.isVisible())) {
      await consent.checkbox.click();
    }
    await expect(consent.checkmark).toBeVisible();
    await expect(requestCodeButton).not.toHaveClass(/\bgrayscale\b/);

    const codeInput = codeForm.locator("input#input0");
    const requestError = phoneForm.locator(".window__error").filter({
      hasText: /\S/,
      visible: true,
    });

    const origin = new URL(page.url()).origin;
    const posts: Request[] = [];
    const recordPost = (request: Request) => {
      const type = request.resourceType();
      if (
        request.method() === "POST" &&
        (type === "xhr" || type === "fetch") &&
        new URL(request.url()).origin === origin
      ) {
        posts.push(request);
      }
    };

    page.on("request", recordPost);
    try {
      await requestCodeButton.click();
      await expect(
        codeInput.or(requestError).filter({ visible: true }).first(),
        "После «Получить код» ожидается поле ввода кода или ошибка отправки",
      ).toBeVisible({ timeout: 15_000 });

      if (!(await codeInput.isVisible())) {
        throw new Error("Сайт показал ошибку на форме запроса SMS-кода");
      }
    } catch (error) {
      await test.info().attach("POST-запросы к сайту при отправке SMS", {
        contentType: "application/json",
        body: JSON.stringify({
          count: posts.length,
          outcomes: posts.map((request) =>
            request.existingResponse()?.status() ??
            (request.failure() ? "сбой сети" : "нет ответа"),
          ),
        }),
      });
      throw error;
    } finally {
      page.off("request", recordPost);
    }
  });

  return codeForm;
}

test.describe("Вход с отправкой SMS", () => {
  test.describe.configure({ mode: "default", retries: 0 });
  test.skip(process.env.RUN_LIVE_SMS !== "1", "Требуется явный запуск с RUN_LIVE_SMS=1");

  test("ТК-ВХ-02. Вход по SMS с неверным кодом", async ({ page }) => {
    test.setTimeout(60_000);
    const codeForm = await requestSmsCode(page);
    const codeFields = codeForm.locator("input.window__input_short[type=tel]");
    const code = String(randomInt(10_000)).padStart(4, "0");

    await test.step("Ввести один случайный четырёхзначный код", async () => {
      await expect(codeFields).toHaveCount(4);
      for (const [index, digit] of [...code].entries()) {
        await codeFields.nth(index).press(digit);
      }

      const error = codeForm.locator(".window__error_mod").filter({ visible: true });
      await expect(error).toHaveText(/^(?!\s*false\s*$)\s*\S/);
      await expect(codeForm).toBeVisible();
      await expect(getProfileBtn(page, "signed-in")).toBeHidden();
    });
  });

  test("ТК-ВХ-04. Повторный запрос SMS после окончания таймера", async ({ page }) => {
    test.setTimeout(90_000);
    const codeForm = await requestSmsCode(page);
    const timer = codeForm.locator(".window__text_timer");
    const resendButton = codeForm.getByText("Получить новый код", { exact: true });

    await test.step("Дождаться окончания отсчёта и один раз запросить новый код", async () => {
      await expect(timer).toBeVisible();
      await expect(resendButton).toBeHidden();
      await expect(resendButton).toBeVisible({ timeout: 60_000 });
      await resendButton.click();

      await expect(timer).toBeVisible();
      await expect(timer.locator("span")).toHaveText(/^(?!00:00)\d{2}:\d{2}$/);
      await expect(resendButton).toBeHidden();
      await expect(codeForm.locator("input#input0")).toBeVisible();
    });
  });
});

test("ТК-ВХ-14. Блокировка запроса SMS при снятом флажке согласия", async ({ page }) => {
  const { phoneForm, consent, requestCodeButton, codeForm } = await openSmsForm(page);

  await test.step("Попытаться получить код без согласия", async () => {
    await expect(consent.checkbox).toBeVisible();
    if (await consent.checkmark.isVisible()) {
      await consent.checkbox.click();
    }
    await expect(consent.checkmark).toBeHidden();
    await expect(requestCodeButton).toHaveClass(/\bgrayscale\b/);
    await requestCodeButton.click();

    const highlightedConsent = phoneForm.locator(".policy-checkbox--highlight");
    await expect(highlightedConsent).toBeVisible();
    await expect(requestCodeButton).toHaveClass(/\bgrayscale\b/);
    await expect(codeForm).toBeHidden();
  });
});
