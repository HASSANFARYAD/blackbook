import type { APIRequestContext, Page } from "@playwright/test";
import type { DecisionRecord } from "../src/types";

export async function fetchDecisions(
  request: APIRequestContext
): Promise<DecisionRecord[]> {
  const res = await request.get("/api/decisions");
  return (await res.json()) as DecisionRecord[];
}

export async function decisionId(
  request: APIRequestContext,
  ip: string,
  recommendation?: string
): Promise<string> {
  const list = await fetchDecisions(request);
  const found = list.find(
    (d) => d.ip === ip && (!recommendation || d.recommendation === recommendation)
  );
  if (!found) {
    throw new Error(`no seeded decision for "${ip}" ${recommendation ?? ""}`);
  }
  return found.decision_id;
}

export async function decisionRecord(
  request: APIRequestContext,
  ip: string,
  recommendation?: string
): Promise<DecisionRecord> {
  const id = await decisionId(request, ip, recommendation);
  const list = await fetchDecisions(request);
  return list.find((d) => d.decision_id === id)!;
}

/** Serve a doctored copy of one decision, leaving every other endpoint live. */
export async function serveRecord(
  page: Page,
  id: string,
  record: DecisionRecord
): Promise<void> {
  await page.route(`**/api/decisions/${id}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(record),
    })
  );
}

export const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "375x667", width: 375, height: 667 },
];

/** True horizontal overflow of the document, plus the widest offending elements. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      offenders: [...document.querySelectorAll<HTMLElement>("*")]
        .filter((el) => el.getBoundingClientRect().right > root.clientWidth + 1)
        .slice(0, 5)
        .map(
          (el) =>
            `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").filter(Boolean).join(".")}` +
            `@right=${Math.round(el.getBoundingClientRect().right)}`
        ),
    };
  });
}

export interface ContrastFailure {
  selector: string;
  text: string;
  ratio: number;
  required: number;
  fontSize: number;
  foreground: string;
  background: string;
}

/**
 * WCAG AA contrast for every rendered text node.
 *
 * Translucent backgrounds are composited down the ancestor chain onto an opaque
 * base; sampling `backgroundColor` alone reports a wildly wrong ratio for this
 * app's `rgba(...)` chips and would produce nothing but false positives.
 */
export async function contrastFailures(page: Page): Promise<ContrastFailure[]> {
  return page.evaluate(() => {
    interface Rgba { r: number; g: number; b: number; a: number }
    const parse = (s: string): Rgba => {
      const n = (s.match(/[-\d.]+/g) || []).map(Number);
      return { r: n[0] ?? 0, g: n[1] ?? 0, b: n[2] ?? 0, a: n.length > 3 ? n[3] : 1 };
    };
    const over = (src: Rgba, dst: Rgba): Rgba => ({
      r: src.r * src.a + dst.r * (1 - src.a),
      g: src.g * src.a + dst.g * (1 - src.a),
      b: src.b * src.a + dst.b * (1 - src.a),
      a: 1,
    });
    const effectiveBg = (el: Element): Rgba => {
      const stack: Rgba[] = [];
      let e: Element | null = el;
      while (e) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c.a > 0) stack.push(c);
        e = e.parentElement;
      }
      let acc: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
      return acc;
    };
    const lum = (c: Rgba) => {
      const f = [c.r, c.g, c.b].map((v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
    };

    const out: ContrastFailure[] = [];
    for (const el of document.querySelectorAll("*")) {
      const text = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent!.trim())
        .join("");
      if (!text) continue;
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;

      const bg = effectiveBg(el);
      const fg = over(parse(cs.color), bg);
      const l1 = lum(fg);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const fontSize = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight) >= 700;
      const large = fontSize >= 24 || (fontSize >= 18.66 && bold);
      const required = large ? 3 : 4.5;
      if (ratio < required) {
        out.push({
          selector: `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ").filter(Boolean).join(".")}`,
          text: text.slice(0, 40),
          ratio: +ratio.toFixed(2),
          required,
          fontSize,
          foreground: cs.color,
          background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        });
      }
    }
    const seen = new Set<string>();
    return out.filter((f) => {
      const key = f.selector + f.foreground + f.background;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }) as Promise<ContrastFailure[]>;
}

/** Collects console errors/warnings and uncaught page errors for the life of the page. */
export function captureConsole(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      messages.push(`[${m.type()}] ${m.text()}`);
    }
  });
  page.on("pageerror", (e) => messages.push(`[pageerror] ${e.message}`));
  return messages;
}
