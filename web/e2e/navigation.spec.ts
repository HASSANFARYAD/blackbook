import { test, expect } from "@playwright/test";
import { decisionRecord } from "./helpers";

test.describe("Cross-page state and navigation", () => {
  // HP-06
  test("a decision carries the same score across all four views", async ({ page, request }) => {
    const record = await decisionRecord(request, "Dune: Messiah");

    await page.goto("/");
    const card = page.locator(".card", { hasText: record.ip }).first();
    await expect(card.locator(".gauge-score")).toHaveText(String(record.score));
    await expect(card.locator(".gauge-rec")).toHaveText(record.recommendation);

    await card.getByRole("link", { name: "Evidence" }).click();
    await page.waitForURL(`**/decisions/${record.decision_id}`);
    await expect(page.getByRole("heading", { name: record.ip })).toBeVisible();
    await expect(page.locator(".gauge-score")).toHaveText(String(record.score));

    await page.getByRole("link", { name: "Stress Test" }).click();
    await page.waitForURL(/stress-test/);
    await expect(page.getByRole("heading", { name: `Counterfactual — ${record.ip}` })).toBeVisible();
    await expect(page.locator(".gauge-score")).toHaveText(String(record.score));

    await page.getByRole("link", { name: "Timeline" }).click();
    await page.waitForURL(/timeline/);
    await expect(page.getByRole("heading", { name: `Decision Drift — ${record.ip}` })).toBeVisible();
    await expect(page.locator(".tl-score").first()).toHaveText(String(record.score));
  });

  // HP-07 / DA-01
  test("back, forward, refresh and deep-link all land correctly mid-workflow", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");
    const nodeCount = record.evidence.nodes.length;

    await page.goto("/");
    await page.locator(".card").first().getByRole("link", { name: "Evidence" }).click();
    await page.waitForURL(/\/decisions\/[^/]+$/);
    const detailUrl = page.url();
    await expect(page.locator(".g-node")).toHaveCount(nodeCount);

    await page.getByRole("link", { name: "Stress Test" }).click();
    await page.waitForURL(/stress-test/);
    await expect(page.locator(".banner")).toBeVisible();

    await page.goBack();
    await page.waitForURL(detailUrl);
    await expect(page.locator(".g-node")).toHaveCount(nodeCount);

    // A hard reload of a deep link must be served by the SPA fallback and rehydrate.
    await page.reload();
    await expect(page.getByRole("heading", { name: record.ip })).toBeVisible();
    await expect(page.locator(".g-node")).toHaveCount(nodeCount);
    await expect(page.locator(".gauge-score")).toHaveText(String(record.score));

    await page.goForward();
    await page.waitForURL(/stress-test/);
    await expect(page.locator(".banner")).toBeVisible();

    await page.goto("/");
    await expect(page.locator(".card").first()).toBeVisible();
  });

  test("the brand link always returns to the command center", async ({ page, request }) => {
    const record = await decisionRecord(request, "Seveneves");
    for (const path of [
      `/decisions/${record.decision_id}`,
      `/decisions/${record.decision_id}/stress-test`,
      `/decisions/${record.decision_id}/timeline`,
    ]) {
      await page.goto(path);
      await page.getByRole("link", { name: /BLACKBOOK/ }).click();
      await expect(page.getByRole("heading", { name: "Decision Command Center" })).toBeVisible();
    }
  });
});
