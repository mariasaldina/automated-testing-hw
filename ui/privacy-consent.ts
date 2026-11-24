import type { Locator } from "@playwright/test";

export function privacyConsent(form: Locator) {
  const consent = form.locator(".checkbox").filter({ visible: true });
  const checkbox = consent.locator(".checkbox__box");
  return {
    checkbox,
    checkmark: checkbox.locator("svg"),
    label: consent.locator(".checkbox__label"),
    highlight: form.locator(".policy-checkbox--highlight"),
  };
}
