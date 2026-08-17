import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const WEB_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const REPO_ROOT = path.resolve(WEB_ROOT, "..");

/**
 * The repo venv if there is one (Windows puts it in Scripts/, POSIX in bin/),
 * otherwise whatever python is on PATH — so the suite runs on any platform.
 */
function resolvePython(): string {
  const candidates = [
    path.join(REPO_ROOT, ".venv", "Scripts", "python.exe"),
    path.join(REPO_ROOT, ".venv", "bin", "python"),
  ];
  return (
    candidates.find((p) => fs.existsSync(p)) ??
    (process.platform === "win32" ? "python" : "python3")
  );
}

export const PYTHON = resolvePython();

export const E2E_ROOT = path.join(os.tmpdir(), "blackbook-e2e");
export const DB_PATH = path.join(E2E_ROOT, `blackbook-${process.pid}.db`);

export const API_BASE = "http://127.0.0.1:8777";
