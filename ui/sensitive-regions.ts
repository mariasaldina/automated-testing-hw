import type { Page } from "@playwright/test";
import { contactPattern } from "../core/logging";

export function sensitiveRegions(page: Page) {
  const pathname = new URL(page.url()).pathname;
  return [
    page.locator([
      "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])",
      "textarea",
      '[contenteditable="true"]',
      "[data-sensitive]",
      ".user-content",
      ".checkout-accordion",
      "#login .window__text_phone > span",
      "#login .window__error",
    ].join(", ")).filter({ visible: true }),
    page.getByText(contactPattern).filter({ visible: true }),
    ...(/^\/personal(?:\/checkout-final|[-]lk\/order)(?:\/|$)/u.test(pathname)
      ? [page.locator("main:visible")]
      : []),
  ];
}
