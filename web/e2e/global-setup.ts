import fs from "node:fs";
import path from "node:path";
import { DB_PATH, E2E_ROOT } from "./env";

export default async function globalSetup() {
  fs.mkdirSync(E2E_ROOT, { recursive: true });

  // Best-effort cleanup of stale DB files from previous runs (a live server
  // may still hold a file lock, so failures are ignored).
  for (const entry of fs.readdirSync(E2E_ROOT)) {
    if (entry.endsWith(".db") && entry !== path.basename(DB_PATH)) {
      try {
        fs.unlinkSync(path.join(E2E_ROOT, entry));
      } catch {
        // locked by a previous process; leave it
      }
    }
  }
}
