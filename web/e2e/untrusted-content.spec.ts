import { test, expect } from "@playwright/test";
import { decisionRecord, fetchDecisions, serveRecord } from "./helpers";

/**
 * Evidence fields (`label`, `source_title`, `quote`, `source_url`) are extracted by an
 * LLM from third-party web pages, so they are attacker-influenced input. These tests
 * poison a record on the wire and assert the UI renders it inertly.
 */
test.describe("Untrusted evidence content", () => {
  const SCRIPT_TAG = "<script>window.__xssScript=1</script>Poisoned Label";
  const IMG_HANDLER = "<img src=x onerror=window.__xssImg=1>Innocent Title";
  const INJECTION =
    "'; DROP TABLE decisions;-- {{7*7}} ${7*7} ../../etc/passwd مرحبا بالعالم 🎬\nsecond line";

  test("markup, injection strings, unicode and RTL render literally", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");
    const poisoned = JSON.parse(JSON.stringify(record));
    poisoned.evidence.nodes[0].label = SCRIPT_TAG;
    poisoned.evidence.nodes[0].source_title = IMG_HANDLER;
    poisoned.evidence.nodes[0].source_url = "https://example.com/legit";
    poisoned.evidence.nodes[0].quote = INJECTION;

    await serveRecord(page, record.decision_id, poisoned);
    await page.goto(`/decisions/${record.decision_id}`);
    await page.locator(".g-node").first().click();

    const result = await page.evaluate(() => ({
      scriptExecuted: !!(window as any).__xssScript,
      imgHandlerFired: !!(window as any).__xssImg,
      injectedImg: !!document.querySelector(".evidence-panel img"),
      injectedScript: !!document.querySelector(".evidence-panel script, .g-node script"),
      quote: document.querySelector(".evidence-panel .quote")?.textContent ?? "",
      label: document.querySelector(".g-node .g-node-label")?.textContent ?? "",
    }));

    // IV-07: no execution, no injected elements — the markup is text.
    expect(result.scriptExecuted).toBe(false);
    expect(result.imgHandlerFired).toBe(false);
    expect(result.injectedImg).toBe(false);
    expect(result.injectedScript).toBe(false);
    expect(result.label).toContain("<script>");

    // IV-08: template expressions are not evaluated, injection text is inert.
    expect(result.quote).toContain("{{7*7}}");
    expect(result.quote).not.toContain("49");
    expect(result.quote).toContain("DROP TABLE");
    expect(result.quote).toContain("../../etc/passwd");

    // IV-06: unicode, RTL and emoji survive intact.
    expect(result.quote).toContain("مرحبا بالعالم");
    expect(result.quote).toContain("🎬");

    // The SQL string was only ever rendered, never executed: the store still answers.
    expect((await fetchDecisions(request)).length).toBeGreaterThan(0);
  });

  // IV-09
  test("a javascript: source URL is never rendered as a live link", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");

    for (const scheme of [
      "javascript:window.__xssHref=1",
      "JaVaScRiPt:window.__xssHref=1",
      "data:text/html;base64,PHNjcmlwdD53aW5kb3cuX194c3NEYXRhPTE8L3NjcmlwdD4=",
      "vbscript:msgbox(1)",
    ]) {
      const poisoned = JSON.parse(JSON.stringify(record));
      poisoned.evidence.nodes[0].source_url = scheme;
      poisoned.evidence.nodes[0].source_title = "Looks like a normal source";

      await page.unroute(`**/api/decisions/${record.decision_id}`).catch(() => {});
      await serveRecord(page, record.decision_id, poisoned);
      await page.goto(`/decisions/${record.decision_id}`);
      await page.locator(".g-node").first().click();

      const panel = page.locator(".evidence-panel");
      await expect(panel).toBeVisible();

      // No anchor may carry the scheme — the safest outcome is no anchor at all.
      const hrefs = await panel.locator("a").evaluateAll((nodes) =>
        nodes.map((n) => n.getAttribute("href") ?? "")
      );
      for (const href of hrefs) {
        expect(href, `scheme ${scheme} reached an href`).not.toMatch(
          /^\s*(javascript|data|vbscript):/i
        );
      }

      // The provenance is still shown to the user, just not as a clickable link.
      await expect(panel).toContainText("Looks like a normal source");
    }
  });

  test("http and https source URLs stay clickable", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");
    await page.goto(`/decisions/${record.decision_id}`);
    await page.locator(".g-node", { hasText: "Acme Studios" }).click();
    await expect(page.locator(".evidence-panel a")).toHaveAttribute(
      "href",
      "https://deadline.com/2026/01/expanse-option-acme"
    );
  });
});
