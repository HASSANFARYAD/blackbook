import { test, expect } from "@playwright/test";
import { decisionId, decisionRecord, fetchDecisions, serveRecord } from "./helpers";

test.describe("Performance sanity", () => {
  // PF-01
  test("every route reaches DOMContentLoaded quickly", async ({ page, request }) => {
    const floor = await decisionId(request, "The Expanse", "PASS");
    const pursue = await decisionId(request, "Dune: Messiah");
    const routes = {
      "command center": "/",
      "evidence graph": `/decisions/${floor}`,
      "stress test": `/decisions/${pursue}/stress-test`,
      timeline: `/decisions/${floor}/timeline`,
    };

    for (const [name, path] of Object.entries(routes)) {
      await page.goto(path, { waitUntil: "networkidle" });
      const dcl = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        return Math.round(nav.domContentLoadedEventEnd);
      });
      expect(dcl, `${name} DCL was ${dcl}ms`).toBeLessThan(3000);
    }
  });

  // PF-02
  test("1,000 decision cards render without stalling the page", async ({ page, request }) => {
    const seeded = await fetchDecisions(request);
    const bulk = Array.from({ length: 1000 }, (_, i) => ({
      ...seeded[0],
      decision_id: `bulk-${i}`,
      ip: `Bulk IP ${i}`,
    }));
    await page.route("**/api/decisions", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bulk) })
    );

    const started = Date.now();
    await page.goto("/");
    await page.locator(".card").last().waitFor({ state: "attached", timeout: 20_000 });
    const elapsed = Date.now() - started;

    expect(await page.locator(".card").count()).toBe(1000);
    expect(elapsed, `1,000 cards took ${elapsed}ms`).toBeLessThan(15_000);
    // Still interactive afterwards.
    await expect(page.getByLabel("IP to evaluate")).toBeEditable();
  });

  // PF-03
  test("a 400-node evidence graph renders", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");
    const big = JSON.parse(JSON.stringify(record));
    const template = big.evidence.nodes[0];
    big.evidence.nodes = Array.from({ length: 400 }, (_, i) => ({
      ...template,
      id: `n${i}`,
      label: `Node ${i}`,
      entity_type: ["ip", "rights_holder", "competitor", "event", "talent"][i % 5],
    }));
    big.evidence.edges = [];
    await serveRecord(page, record.decision_id, big);

    const started = Date.now();
    await page.goto(`/decisions/${record.decision_id}`);
    await page.locator(".g-node").last().waitFor({ state: "attached", timeout: 20_000 });
    const elapsed = Date.now() - started;

    expect(await page.locator(".g-node").count()).toBe(400);
    expect(elapsed, `400 nodes took ${elapsed}ms`).toBeLessThan(15_000);
  });

  // PF-04
  test("no unbounded polling while idle", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const calls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/")) calls.push(`${r.method()} ${r.url()}`);
    });
    await page.waitForTimeout(6000);

    expect(calls, `idle traffic: ${calls.join(", ")}`).toEqual([]);
  });

  // PF-05
  test("no route issues the same API request twice", async ({ page, request }) => {
    const floor = await decisionId(request, "The Expanse", "PASS");
    const pursue = await decisionId(request, "Dune: Messiah");
    const routes = ["/", `/decisions/${floor}`, `/decisions/${pursue}/stress-test`, `/decisions/${floor}/timeline`];

    for (const path of routes) {
      const calls: string[] = [];
      const listener = (r: { method: () => string; url: () => string }) => {
        if (r.url().includes("/api/")) calls.push(`${r.method()} ${new URL(r.url()).pathname}`);
      };
      page.on("request", listener as never);
      await page.goto(path, { waitUntil: "networkidle" });
      page.off("request", listener as never);

      const duplicates = calls.filter((c, i) => calls.indexOf(c) !== i);
      expect(duplicates, `${path} duplicated: ${[...new Set(duplicates)].join(", ")}`).toEqual([]);
    }
  });
});
