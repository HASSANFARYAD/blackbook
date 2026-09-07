import { test, expect } from "@playwright/test";
import { decisionId, decisionRecord, serveRecord } from "./helpers";

test.describe("Counterfactual Stress Test", () => {
  test("shows the minimum detected flip to PASS", async ({ page, request }) => {
    const id = await decisionId(request, "Seveneves");
    await page.goto(`/decisions/${id}/stress-test`);

    await expect(
      page.getByRole("heading", { name: /Counterfactual/ })
    ).toBeVisible();

    const banner = page.locator(".banner-flip");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Minimum detected flip");

    // every flip scenario flips away from the current recommendation
    await expect(page.locator(".scenario").first()).toBeVisible();
    await expect(
      page.locator(".scenario .chip", { hasText: "PASS" }).first()
    ).toBeVisible();
  });

  test("sensitivity table lists per-component score impact", async ({
    page,
    request,
  }) => {
    const id = await decisionId(request, "Dune: Messiah");
    await page.goto(`/decisions/${id}/stress-test`);

    await expect(page.locator(".table")).toBeVisible();
    await expect(page.locator(".table tbody tr").first()).toBeVisible();
    await expect(page.locator(".table")).toContainText("Rights confidence");

    // A 10-point swing on a 0.30-weighted component moves the total by 3.
    await expect(
      page.locator(".table tbody tr", { hasText: "Rights confidence" })
    ).toContainText("3");
  });

  test("a PASS decision reports no reachable flip rather than a false one", async ({
    page,
    request,
  }) => {
    const id = await decisionId(request, "The Expanse", "PASS");
    await page.goto(`/decisions/${id}/stress-test`);

    await expect(page.locator(".banner")).toContainText("No reachable flip");
    await expect(page.locator(".banner-flip")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Margin erosion" })
    ).toBeVisible();
  });
});

test.describe("Counterfactual headline correctness", () => {
  // BUG-03 regression: the banner claims to show the *smallest* change that flips
  // the recommendation. It must therefore be the smallest, regardless of which
  // component the engine happened to evaluate first or how severe the flip is.
  test("the headline flip is the smallest one, not merely the first listed", async ({
    page,
    request,
  }) => {
    const record = await decisionRecord(request, "Dune: Messiah");

    // A PURSUE decision where a 10-point rights slip flips it but opportunity
    // needs 40 — and where the larger swing is also the more severe outcome.
    await serveRecord(page, record.decision_id, { ...record, score: 89, recommendation: "PURSUE" });
    await page.route("**/api/counterfactual", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          sensitivity: {
            "Market opportunity": 3,
            "Rights confidence": 3,
            "Competition pressure": 2,
            "Production feasibility": 2,
          },
          scenarios: [
            {
              change: "Market opportunity -40 points",
              delta: -40,
              projected_score: 45,
              projected_recommendation: "PASS",
              explanation: "Large swing, severe outcome.",
            },
            {
              change: "Rights confidence -10 points",
              delta: -10,
              projected_score: 86,
              projected_recommendation: "WATCH",
              explanation: "Small swing, mild outcome.",
            },
          ],
        }),
      })
    );

    await page.goto(`/decisions/${record.decision_id}/stress-test`);

    const banner = page.locator(".banner").first();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Rights confidence -10 points");
    await expect(banner).not.toContainText("Market opportunity -40 points");
  });

  test("scenarios are listed smallest swing first", async ({ page, request }) => {
    const id = await decisionId(request, "Dune: Messiah");
    await page.goto(`/decisions/${id}/stress-test`);
    await expect(page.locator(".scenario").first()).toBeVisible();

    const magnitudes = await page
      .locator(".scenario h3")
      .allInnerTexts()
      .then((titles) => titles.map((t) => Math.abs(Number(t.match(/([+-]\d+)\s*points/)?.[1] ?? 0))));

    expect(magnitudes.length).toBeGreaterThan(1);
    for (let i = 1; i < magnitudes.length; i++) {
      expect(magnitudes[i], `scenario ${i} (${magnitudes[i]}) precedes a smaller one`).toBeGreaterThanOrEqual(
        magnitudes[i - 1]
      );
    }
  });
});
