import { defineConfig } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests",
  use: {
    channel: "chrome",
    baseURL: "https://hypermarketmebel.ru/",
  },
});
