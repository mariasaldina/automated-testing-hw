import { config as loadEnv } from "dotenv";

loadEnv({ quiet: true, path: process.env.PLAYWRIGHT_ENV_FILE ?? ".env" });

export const settings = {
  baseURL: process.env.BASE_URL ?? "https://hypermarketmebel.ru/",
  browserChannel: process.env.BROWSER_CHANNEL ?? "chrome",
  liveSms: process.env.RUN_LIVE_SMS === "1",
};

function milliseconds(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new Error(`${name} должен быть целым положительным числом миллисекунд`);
  }
  return value;
}

export const timeouts = {
  test: milliseconds("TEST_TIMEOUT_MS", 45_000),
  expect: milliseconds("EXPECT_TIMEOUT_MS", 5_000),
  action: milliseconds("ACTION_TIMEOUT_MS", 10_000),
  navigation: milliseconds("NAVIGATION_TIMEOUT_MS", 15_000),
  authForm: milliseconds("AUTH_FORM_TIMEOUT_MS", 10_000),
  authOpenRetry: milliseconds("AUTH_OPEN_RETRY_MS", 1_000),
  authResponse: milliseconds("AUTH_RESPONSE_TIMEOUT_MS", 10_000),
  smsRequest: milliseconds("SMS_REQUEST_TIMEOUT_MS", 15_000),
  smsTest: milliseconds("SMS_TEST_TIMEOUT_MS", 60_000),
  screenshot: milliseconds("SCREENSHOT_TIMEOUT_MS", 5_000),
};

export function requireCredential(name: "PHONE" | "EMAIL" | "PASSWORD" | "CUSTOMER_NAME") {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Необходимо задать ${name}`);
  return value;
}
