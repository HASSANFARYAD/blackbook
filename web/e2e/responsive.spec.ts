import { test, expect } from "@playwright/test";
import { decisionId, decisionRecord, horizontalOverflow, serveRecord, VIEWPORTS } from "./helpers";

test.describe("Responsive layout", () => {
  // UX-02
  for (const viewport of VIEWPORTS) {
    test(`no horizontal page scroll at ${viewport.name}`, async ({ page, request }) => {
      const floor = await decisionId(request, "The Expanse", "PASS");
      const pursue = await decisionId(request, "Dune: Messiah");
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      const routes = {
        "command center": "/",
        "evidence graph": `/decisions/${floor}`,
        "stress test": `/decisions/${pursue}/stress-test`,
        timeline: `/decisions/${floor}/timeline`,
      };

      for (const [name, path] of Object.entries(routes)) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const overflow = await horizontalOverflow(page);
        expect(
          overflow.scrollWidth,
          `${name} at ${viewport.name} scrolls sideways (offenders: ${overflow.offenders.join(", ")})`
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
      }
    });
  }

  // UX-03: the graph is the demo centrepiece — it must pan inside its own box.
  test("a wide evidence graph scrolls inside its container, not the page", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");
    const wide = JSON.parse(JSON.stringify(record));
    const template = wide.evidence.nodes[0];
    wide.evidence.nodes = Array.from({ length: 400 }, (_, i) => ({
      ...template,
      id: `n${i}`,
      label: `Node ${i}`,
      entity_type: ["ip", "rights_holder", "territory", "adaptation", "competitor", "talent", "event", "other"][i % 8],
    }));
    wide.evidence.edges = [];

    await serveRecord(page, record.decision_id, wide);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/decisions/${record.decision_id}`);
    await expect(page.locator(".g-node").first()).toBeVisible();

    const overflow = await horizontalOverflow(page);
    expect(
      overflow.scrollWidth,
      `400-node graph pushed the document sideways (offenders: ${overflow.offenders.join(", ")})`
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);

    // ...and the graph itself is still scrollable, so nothing was clipped away.
    const scrollable = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".graph-wrap")!;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(scrollable.scrollWidth).toBeGreaterThan(scrollable.clientWidth);
  });

  test("the graph container never exceeds its available width at 375px", async ({ page, request }) => {
    const floor = await decisionId(request, "The Expanse", "PASS");
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`/decisions/${floor}`);
    await expect(page.locator(".g-node").first()).toBeVisible();

    const box = await page.locator(".graph-wrap").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(375);
  });
});
