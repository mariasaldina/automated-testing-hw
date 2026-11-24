import { homedir } from "node:os";
import pino from "pino";
import { prettyFactory } from "pino-pretty";

const redacted = "[СКРЫТО]";
const configuredLevels = ["debug", "info", "warn", "error"];
const level = (process.env.LOG_LEVEL ?? "info").toLowerCase();
const format = (process.env.LOG_FORMAT ?? (process.env.CI ? "json" : "pretty")).toLowerCase();

if (!configuredLevels.includes(level)) {
  throw new Error("LOG_LEVEL должен быть debug, info, warn или error");
}

if (!["pretty", "json", "json-pretty"].includes(format)) {
  throw new Error("LOG_FORMAT должен быть pretty, json или json-pretty");
}

const pretty = prettyFactory({
  translateTime: "SYS:HH:MM:ss",
  singleLine: false,
  colorizeObjects: false,
});

const destination = format === "json" ? process.stdout : {
  write(line: string) {
    const formatted = format === "pretty"
      ? pretty(line)
      : JSON.stringify(JSON.parse(line), null, 2) + "\n";
    process.stdout.write(formatted);
  },
};

const sensitiveKeys = [
  "password", "phone", "email", "otp", "smsCode", "token", "accessToken",
  "refreshToken", "cookie", "cookies", "authorization", "address", "customerName",
];

export const log = pino({
  level,
  base: null,
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      ...sensitiveKeys.flatMap((key) => [key, `*.${key}`]),
      'headers["set-cookie"]',
    ],
    censor: redacted,
  },
}, destination);

export const contactPattern =
  /[\w.%+-]+@[\w.-]+\.[a-z]{2,}|(?<!\d)(?:\+?[78][ .\u00a0\u202f-]*)?(?:\(\d{3}\)|\d{3})[ .\u00a0\u202f-]*\d{3}[ .\u00a0\u202f-]*\d{2}[ .\u00a0\u202f-]*\d{2}(?!\d)/i;

const sensitiveEnvKeys = [
  "PHONE", "EMAIL", "PASSWORD", "NEW_PASSWORD", "SMS_CODE", "OTP", "TOKEN",
  "AUTH_TOKEN", "ACCESS_TOKEN", "REFRESH_TOKEN", "COOKIE", "COOKIES",
  "CUSTOMER_NAME", "ADDRESS",
];

export function redactText(text: string): string {
  const values = sensitiveEnvKeys
    .map((key) => process.env[key])
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.length - a.length);

  for (const value of values) {
    const escaped = JSON.stringify(value).slice(1, -1);
    text = text.split(value).join(redacted);
    if (escaped !== value) text = text.split(escaped).join(redacted);
  }

  return text
    .replace(new RegExp(contactPattern.source, "gi"), redacted)
    .replace(/\b(?:set-cookie|cookie|authorization|proxy-authorization)\s*:\s*[^\r\n]+/gi, redacted)
    .replace(/(\b(?:password|passwd|otp|smsCode|token|accessToken|refreshToken|cookies?|authorization|address|customerName)["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'[^']*'|[^\s,;}]+)/gi, `$1${redacted}`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/=-]+/gi, redacted)
    .replace(/\b(fill|press|pressSequentially)\("(?:\\.|[^"\\])*"\)/g, "$1([СКРЫТО])")
    .replace(/\bvalue="[^"]*"/gi, 'value="[СКРЫТО]"')
    .split(process.cwd()).join(".")
    .split(homedir()).join("~");
}
