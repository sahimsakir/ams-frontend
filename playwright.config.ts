import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 240000,
  expect: { timeout: 20000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    permissions: ["camera"],
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--disable-gpu", "--disable-dev-shm-usage"],
    },
  },
  webServer: { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: false },
});
