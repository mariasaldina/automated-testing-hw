import { requireCredential, settings, timeouts } from "../../core/settings";
import { expect, test as base } from "../../core/test";
import { AuthDialog } from "../../ui/auth-dialog";
import { CartPage } from "../../ui/cart-page";
import { CatalogPage, straightSofasPath } from "../../ui/catalog-page";
import { CheckoutPage } from "../../ui/checkout-page";
import { OrderHistory } from "../../ui/order-history";
import { ProductPage } from "../../ui/product-page";

type Cleanup = {
  order?: () => Promise<void>;
  cart?: () => Promise<void>;
};

const test = base.extend<{ cleanup: Cleanup }>({
  cleanup: [async ({ page }, use) => {
    const cleanup: Cleanup = {};
    await use(cleanup);
    try {
      if (cleanup.order) await test.step("Отменить созданный тестом заказ", cleanup.order);
    } finally {
      if (cleanup.cart && !page.isClosed()) {
        await test.step("Проверить и очистить корзину после теста", cleanup.cart);
      }
    }
  }, { timeout: timeouts.orderCleanup }],
});

test.describe.configure({ retries: 0 });

function priceInKopecks(text: string) {
  const price = text.replace(/\s/gu, "").match(/^(\d+)(?:[,.](\d{1,2}))?₽$/u);
  if (!price) throw new Error("Цена должна быть указана в рублях");
  return Number(price[1]) * 100 + Number((price[2] ?? "").padEnd(2, "0"));
}

async function findNewOrder(history: OrderHistory, existing: Set<string>, number?: string) {
  let match: { number: string; href: string } | undefined;
  await expect.poll(async () => {
    await history.open();
    const fresh = (await history.activeOrders()).filter((order) => !existing.has(order.number));
    match = number ? fresh.find((order) => order.number === number)
      : fresh.length === 1 ? fresh[0] : undefined;
    return Boolean(match);
  }, { timeout: timeouts.orderSync, message: "В истории должен появиться однозначно определяемый новый заказ" })
    .toBe(true);
  if (!match) throw new Error("Новый заказ не определён");
  return match;
}

test("ТК-КП-21. Оформление заказа от каталога до «Моих заказов»", async ({ page, cleanup }) => {
  test.skip(!settings.orderPreview && !settings.liveOrder,
    "Оформление запускается через RUN_LIVE_ORDER=1, предпросмотр через RUN_ORDER_PREVIEW=1");
  test.setTimeout(timeouts.orderTest);

  const email = requireCredential("EMAIL");
  const password = requireCredential("PASSWORD");
  const auth = new AuthDialog(page);
  const catalog = new CatalogPage(page);
  const product = new ProductPage(page);
  const cart = new CartPage(page);
  const checkout = new CheckoutPage(page);

  await test.step("Войти по паролю и проверить пустую корзину", async () => {
    await auth.openFromCatalog();
    const form = await auth.openPasswordForm();
    await form.fill(email, password);
    await form.submitAndWaitForResponse();
    await expect(auth.header.profileButton("signed-in")).toBeVisible();
    await cart.open();
    await expect(cart.emptyMessage, "Перед тестом корзина должна быть пустой").toBeVisible();
    await expect(cart.rows).toHaveCount(0);
  });

  const offer = await test.step("Выбрать первый диван после фильтра «В наличии»", async () => {
    await page.goto(straightSofasPath, { waitUntil: "domcontentloaded" });
    await catalog.showInStock();
    return catalog.openFirstSofa();
  });
  const selected = cart.rowFor(offer);

  const productPrice = await test.step("Проверить карточку и добавить одну штуку в корзину", async () => {
    await expect(product.heading).toHaveText(offer.name);
    await expect(product.price).toBeVisible();
    const price = priceInKopecks(await product.price.innerText());
    expect(price).toBeGreaterThan(0);
    cleanup.cart = async () => {
      await cart.open();
      await expect(cart.rows.first().or(cart.emptyMessage), "Корзина должна загрузиться перед очисткой")
        .toBeVisible({ timeout: timeouts.orderSync });
      if (await cart.emptyMessage.isVisible()) return;

      await expect(cart.rows, "Перед очисткой в корзине должен быть ровно один товар").toHaveCount(1);
      await expect(selected.row, "Удалять можно только товар, выбранный этим тестом").toBeVisible();
      await selected.select();
      await expect(selected.checkmark).toBeVisible();
      await cart.removeSelected();
      await expect(cart.emptyMessage).toBeVisible();
    };
    await product.addToCart();
    return price;
  });

  await test.step("Сверить выбранный диван, количество, цену и итог в корзине", async () => {
    await cart.open();
    await expect(selected.row, `В корзине должно появиться предложение ${offer.offerId}`)
      .toBeVisible({ timeout: timeouts.orderSync });
    await expect(selected.name, `В строке корзины должно быть название «${offer.name}»`).toBeVisible();
    await expect(cart.rows).toHaveCount(1);
    await expect(selected.quantity).toHaveValue("1");
    await expect(selected.price).toBeVisible();
    expect(priceInKopecks(await selected.price.innerText())).toBe(productPrice);
    await selected.select();
    await expect(selected.checkmark).toBeVisible();
    await expect(cart.total).toBeVisible();
    expect(priceInKopecks(await cart.total.innerText())).toBe(productPrice);
  });

  await test.step("Открыть форму и проверить этапы оформления", async () => {
    await cart.openCheckout();
    await expect(checkout.heading).toBeVisible();
    await expect(checkout.recipientStep).toBeVisible();
    await expect(checkout.deliveryStep).toBeVisible();
    await expect(checkout.paymentStep).toBeVisible();
  });

  await test.step("Подтвердить контактные данные получателя", () => checkout.continueWithSavedRecipient());

  const { address, total } = await test.step("Выбрать ПВЗ и проверить итоговую сумму", async () => {
    const address = await checkout.choosePickupPoint();
    await checkout.acceptOrderPolicy();
    await expect(checkout.total).toBeVisible();
    const total = priceInKopecks(await checkout.total.innerText());
    expect(total).toBeGreaterThan(0);
    return { address, total };
  });

  test.skip(settings.orderPreview, "Предпросмотр остановлен перед созданием заказа");

  const historyPage = await page.context().newPage();
  const history = new OrderHistory(historyPage);
  const existing = await test.step("Запомнить существующие активные заказы", async () => {
    await history.open();
    return new Set((await history.activeOrders()).map(({ number }) => number));
  });
  let number: string | undefined;
  let inspectedOrder: Awaited<ReturnType<typeof findNewOrder>> | undefined;

  cleanup.order = async () => {
    try {
      const created = inspectedOrder ?? await findNewOrder(history, existing, number);
      if (!inspectedOrder) await history.openDetails(created.href);
      if (!number) {
        await expect(history.product(offer.name), "Новый заказ должен содержать тестовый диван").toBeVisible();
        expect(priceInKopecks(await history.total.innerText())).toBe(total);
        await expect(history.deliveryAddress).toContainText(address);
      }
      await history.cancel();
      await expect.poll(async () => {
        await history.open();
        return (await history.activeOrders()).some((order) => order.number === created.number);
      }, { timeout: timeouts.orderSync, message: "Отменённый заказ должен исчезнуть из активных" }).toBe(false);
    } finally {
      await historyPage.close();
    }
  };

  await test.step("Создать заказ и завершить оформление с оплатой в магазине", async () => {
    await checkout.createOrder((createdNumber) => { number = createdNumber; });
    const receiptNumber = await checkout.finishWithStorePayment();
    expect(Boolean(receiptNumber), "На подтверждении должен быть номер заказа").toBe(true);
    if (number) {
      expect(receiptNumber === number, "Номер на подтверждении должен совпадать с созданным заказом").toBe(true);
    }
    number ??= receiptNumber;
  });

  await test.step("Найти новый заказ и сверить состав, сумму и получение", async () => {
    const created = await findNewOrder(history, existing, number);
    await history.openDetails(created.href);
    inspectedOrder = created;
    await expect(history.product(offer.name)).toBeVisible();
    await expect(history.quantity).toHaveText(/^1\s+товар$/u);
    expect(priceInKopecks(await history.total.innerText())).toBe(total);
    await expect(history.pickup, "В деталях заказа должен отображаться способ получения")
      .toContainText(/самовывоз|пункт[а-яё]*\s+выдачи|^Доставка заказа$/iu);
    await expect(history.deliveryAddress).toContainText(address);
  });
});
