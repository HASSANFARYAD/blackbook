import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Paths are absolute and supplied by demo/build.mjs rather than derived from cwd.
const REPO_ROOT = process.env.DEMO_REPO_ROOT ?? process.cwd();
const DEMO_DIR = path.join(REPO_ROOT, "demo");
const OUTPUT_DIR = process.env.DEMO_OUTPUT_DIR ?? path.join(DEMO_DIR, "output");
const RAW_DIR = path.join(OUTPUT_DIR, "raw");
const DEMO_PORT = Number(process.env.DEMO_PORT ?? 8795);
const BASE_URL = `http://127.0.0.1:${DEMO_PORT}`;

/**
 * Recording config, deliberately separate from the test config in web/.
 *
 * Native 1920x1080 capture: the viewport and the video frame are the same size, so
 * nothing is ever upscaled. deviceScaleFactor is pinned to 1 so the recording is
 * identical whatever the host display is set to.
 */

function resolvePython(): string {
  const candidates = [
    path.join(REPO_ROOT, ".venv", "Scripts", "python.exe"),
    path.join(REPO_ROOT, ".venv", "bin", "python"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? (process.platform === "win32" ? "python" : "python3");
}

const DB_PATH = path.join(os.tmpdir(), "blackbook-demo", `demo-${process.pid}.db`);
const dryRun = process.env.DEMO_DRY_RUN === "1";

export default defineConfig({
  testDir: DEMO_DIR,
  testMatch: "record.spec.ts",
  // One take, start to finish. A retry re-records the whole thing rather than
  // leaving a half-finished cut behind; takes are never spliced.
  retries: dryRun ? 0 : 1,
  workers: 1,
  fullyParallel: false,
  timeout: 6 * 60 * 1000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: path.join(RAW_DIR, "artifacts"),
  use: {
    baseURL: BASE_URL,
    // Full Chromium rather than the headless shell: same rendering path a viewer
    // would see, and the shell has no advantage once we are capturing video.
    channel: "chromium",
    headless: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    // Clean profile by construction: fresh Chromium, no extensions, no saved
    // credentials, no bookmark bar, no notification or cookie prompts.
    permissions: [],
    colorScheme: "dark",
    reducedMotion: "no-preference",
    video: dryRun
      ? "off"
      : { mode: "on", size: { width: 1920, height: 1080 } },
  },
  webServer: {
    command: `"${resolvePython()}" -m uvicorn app.api:app --host 127.0.0.1 --port ${DEMO_PORT}`,
    cwd: REPO_ROOT,
    env: {
      BLACKBOOK_DB: DB_PATH,
      BLACKBOOK_SEED_DEMO: "1",
      // No external calls in the demo path: the run is byte-identical between takes.
      GOOGLE_API_KEY: "",
      PARALLEL_API_KEY: "",
    },
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
