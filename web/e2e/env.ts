import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const WEB_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const REPO_ROOT = path.resolve(WEB_ROOT, "..");

export const PYTHON = path.join(REPO_ROOT, ".venv", "Scripts", "python.exe");

export const E2E_ROOT = path.join(os.tmpdir(), "blackbook-e2e");
export const DB_PATH = path.join(E2E_ROOT, `blackbook-${process.pid}.db`);

export const API_BASE = "http://127.0.0.1:8777";
