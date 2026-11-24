import type { Page } from "@playwright/test";

export class Header {
  constructor(private readonly page: Page) {}

  profileButton(state: "guest" | "signed-in") {
    const icon = state === "guest" ? "lk-black.svg" : "lk-black-filled.svg";
    return this.page.locator("header .l-head-informer__link").filter({
      has: this.page.locator(`img[src="/images/bottom-menu/${icon}"]`),
      visible: true,
    });
  }

  get profileMenu() {
    return this.page.locator(".l-head-informer > .user-content:visible");
  }

  get logoutOption() {
    return this.profileMenu.getByText("Выход", { exact: true });
  }

  get profileName() {
    return this.profileMenu.locator('div:has(> a[href="/personal-lk/bonus"]) > .pl-2');
  }
}
