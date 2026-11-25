import { expect, test } from "../../core/test";
import { AuthDialog } from "../../ui/auth-dialog";

const consentText =
  "Я подтверждаю ознакомление с политикой конфиденциальности и даю согласие на обработку персональных данных";

test("ТК-ВХ-13. Отображение и переключение флажка согласия", async ({
  page,
}) => {
  const auth = new AuthDialog(page);
  await test.step("Открыть форму входа из каталога", () => auth.openFromCatalog());
  const { checkbox, checkmark, label } = auth.consent;

  await test.step("Проверить отображение флажка и текст согласия", async () => {
    await expect(checkbox).toBeVisible();
    await expect(label).toBeVisible();
    await expect(label).toHaveText(consentText);
    await expect(checkmark).toBeHidden();
  });

  await test.step("Установить и снять флажок", async () => {
    await checkbox.click();
    await expect(checkmark).toBeVisible();
    await checkbox.click();
    await expect(checkmark).toBeHidden();
  });
});
