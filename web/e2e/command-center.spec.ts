import { test, expect } from "@playwright/test";

test.describe("Decision Command Center", () => {
  test("lists seeded decisions with recommendations and scores", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Decision Command Center" })
    ).toBeVisible();

    for (const ip of ["The Expanse", "Dune: Messiah", "Seveneves"]) {
      await expect(
        page.getByRole("heading", { name: ip }).first()
      ).toBeVisible();
    }

    for (const rec of ["PURSUE", "WATCH", "PASS"]) {
      await expect(page.locator(".gauge-rec", { hasText: rec }).first()).toBeVisible();
    }

    await expect(page.locator(".card")).toHaveCount(5);
    await expect(page.locator(".gauge-score").first()).toBeVisible();
    await expect(page.locator(".component-value").first()).toBeVisible();
  });

  test("evaluate surfaces an error when Gemini key is missing", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByLabel("IP to evaluate").fill("A Novel Idea");
    await page.getByRole("button", { name: "Evaluate" }).click();

    await expect(page.locator(".error")).toBeVisible();
    await expect(page.locator(".error")).toContainText("GOOGLE_API_KEY");
  });

  test("watch reports no drift for seeded decisions", async ({ page }) => {
    await page.goto("/");
    const firstCard = page.locator(".card").first();
    await firstCard.getByRole("button", { name: "Watch" }).click();

    await expect(page.locator(".notice")).toContainText("No material drift");
  });
});
