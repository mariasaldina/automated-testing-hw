import type { Page } from "@playwright/test";
import { contactPattern } from "../core/logging";

export function sensitiveRegions(page: Page) {
  return [
    page.locator([
      "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])",
      "textarea",
      '[contenteditable="true"]',
      "[data-sensitive]",
      ".user-content",
      "#login .window__text_phone > span",
      "#login .window__error",
    ].join(", ")).filter({ visible: true }),
    page.getByText(contactPattern).filter({ visible: true }),
  ];
}
