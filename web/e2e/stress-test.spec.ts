import { test, expect } from "@playwright/test";
import { decisionId } from "./helpers";

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
  });
});
