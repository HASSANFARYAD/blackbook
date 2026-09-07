import { test, expect } from "@playwright/test";
import { contrastFailures, decisionId } from "./helpers";

async function routes(request: Parameters<typeof decisionId>[0]) {
  const floor = await decisionId(request, "The Expanse", "PASS");
  const pursue = await decisionId(request, "Dune: Messiah");
  return {
    "command center": "/",
    "evidence graph": `/decisions/${floor}`,
    "stress test": `/decisions/${pursue}/stress-test`,
    timeline: `/decisions/${floor}/timeline`,
  };
}

test.describe("Accessibility", () => {
  // UX-05
  test("every interactive element has an accessible name and every image has alt text", async ({ page, request }) => {
    for (const [name, path] of Object.entries(await routes(request))) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const audit = await page.evaluate(() => {
        const nameOf = (el: any) =>
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          (el.labels && el.labels[0]?.innerText) ||
          el.innerText?.trim() ||
          el.getAttribute("alt") ||
          "";
        return {
          unnamed: [...document.querySelectorAll("a,button,input,select,textarea,[tabindex]")]
            .filter((el) => !nameOf(el))
            .map((el) => `${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`),
          imgsWithoutAlt: [...document.querySelectorAll("img")].filter((i) => !i.getAttribute("alt")).length,
          lang: document.documentElement.lang,
          landmarks: {
            main: !!document.querySelector("main"),
            header: !!document.querySelector("header"),
          },
        };
      });
      expect(audit.unnamed, `${name} has unnamed controls`).toEqual([]);
      expect(audit.imgsWithoutAlt, `${name} has images without alt`).toBe(0);
      expect(audit.lang).toBe("en");
      expect(audit.landmarks.main, `${name} has no <main>`).toBe(true);
      expect(audit.landmarks.header, `${name} has no <header>`).toBe(true);
    }
  });

  // UX-06
  test("all text meets WCAG AA contrast", async ({ page, request }) => {
    for (const [name, path] of Object.entries(await routes(request))) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      if (path.match(/\/decisions\/[^/]+$/)) {
        await page.locator(".g-node").first().click(); // reveal the provenance panel too
      }
      const failures = await contrastFailures(page);
      expect(
        failures,
        `${name}: ${failures.map((f) => `${f.selector} ${f.ratio}:1 (need ${f.required}) "${f.text}"`).join(" | ")}`
      ).toEqual([]);
    }
  });

  // UX-07
  test("heading levels never skip", async ({ page, request }) => {
    for (const [name, path] of Object.entries(await routes(request))) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const levels = await page.evaluate(() =>
        [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => Number(h.tagName[1]))
      );
      expect(levels[0], `${name} does not start at h1`).toBe(1);
      for (let i = 1; i < levels.length; i++) {
        expect(
          levels[i] - levels[i - 1],
          `${name} jumps h${levels[i - 1]} -> h${levels[i]}`
        ).toBeLessThanOrEqual(1);
      }
    }
  });

  // UX-04
  test("the command center is fully operable by keyboard with visible focus", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".card").first()).toBeVisible();

    const stops: { tag: string; label: string; focusVisible: boolean }[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        const outlined = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
        const shadowed = cs.boxShadow !== "none";
        return {
          tag: el.tagName.toLowerCase(),
          label: (el.getAttribute("aria-label") || el.innerText || (el as HTMLInputElement).placeholder || "").trim(),
          focusVisible: outlined || shadowed,
        };
      });
      if (stop) stops.push(stop);
    }

    expect(stops.length).toBeGreaterThan(4);
    for (const stop of stops) {
      expect(stop.focusVisible, `no visible focus on ${stop.tag}("${stop.label}")`).toBe(true);
    }
    // Tab order reaches the form before the cards below it.
    const labels = stops.map((s) => s.label);
    expect(labels.indexOf("IP to evaluate")).toBeLessThan(labels.indexOf("Evidence"));

    // Enter on a focused card link navigates — no mouse required.
    await page.goto("/");
    await page.locator(".card").first().getByRole("link", { name: "Evidence" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/decisions\/[^/]+$/);
    await expect(page.locator(".g-node").first()).toBeVisible();
  });

  // UX-10
  test("the evidence panel can be dismissed by keyboard and by button", async ({ page, request }) => {
    const floor = await decisionId(request, "The Expanse", "PASS");
    await page.goto(`/decisions/${floor}`);

    await page.locator(".g-node").first().click();
    await expect(page.locator(".evidence-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".evidence-panel")).toHaveCount(0);

    await page.locator(".g-node").first().click();
    await expect(page.locator(".evidence-panel")).toBeVisible();
    await page.getByRole("button", { name: /close evidence/i }).click();
    await expect(page.locator(".evidence-panel")).toHaveCount(0);
  });
});
