import type { Recommendation } from "./types";

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDay(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function recColor(rec: Recommendation): string {
  switch (rec) {
    case "PURSUE":
      return "#22c55e";
    case "WATCH":
      return "#f59e0b";
    case "PASS":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

export function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A message fit to show a user.
 *
 * `String(err)` on a rejected fetch yields "TypeError: Failed to fetch" and on an
 * API error yields "Error: <detail>" — the JS class name is noise at best and
 * misleading at worst, so strip it and translate the one failure mode that has
 * no server-side detail to report.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof TypeError) {
    return "Could not reach the BLACKBOOK service. Check that it is running, then try again.";
  }
  const raw = err instanceof Error ? err.message : String(err);
  const cleaned = raw.replace(/^(?:[A-Za-z]*Error):\s*/, "").trim();
  if (!cleaned) return "Something went wrong. Please try again.";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * An evidence `source_url` safe to put in an href, or null.
 *
 * Evidence is LLM-extracted from third-party pages, so the scheme is untrusted
 * input. Only http(s) becomes a link; anything else (javascript:, data:,
 * vbscript:, a relative path) is shown as plain text instead.
 */
export function safeHref(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
