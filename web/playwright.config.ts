import { defineConfig } from "@playwright/test";
import { API_BASE, DB_PATH, PYTHON, REPO_ROOT } from "./e2e/env";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: API_BASE,
    headless: true,
  },
  webServer: {
    command: `"${PYTHON}" -m uvicorn app.api:app --host 127.0.0.1 --port 8777`,
    cwd: REPO_ROOT,
    env: {
      BLACKBOOK_DB: DB_PATH,
      BLACKBOOK_SEED_DEMO: "1",
      // The server loads .env, so blank the key explicitly: the suite asserts
      // the missing-key error path and must not depend on the developer's .env.
      GOOGLE_API_KEY: "",
    },
    url: `${API_BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
