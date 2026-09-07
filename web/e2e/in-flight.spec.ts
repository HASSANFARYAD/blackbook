import { test, expect } from "@playwright/test";

test.describe("In-flight action state", () => {
  // UX-09: a click that silently does nothing is worse than a disabled button.
  test("every Watch button disables while any watch is in flight", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".card").first()).toBeVisible();

    await page.route("**/api/watch", async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });

    const cards = page.locator(".card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(1);

    await cards.nth(0).getByRole("button", { name: /Watch/ }).click();
    await expect(cards.nth(0).getByRole("button", { name: /Checking/ })).toBeDisabled();

    for (let i = 1; i < count; i++) {
      await expect(
        cards.nth(i).getByRole("button", { name: /Watch|Checking/ }),
        `card ${i} stayed clickable during another card's watch`
      ).toBeDisabled();
    }

    await expect(cards.nth(1).getByRole("button", { name: /Watch/ })).toBeEnabled({ timeout: 15_000 });
    await page.unroute("**/api/watch");
  });

  // IV-11
  test("triple-clicking Evaluate fires exactly one request", async ({ page }) => {
    await page.goto("/");
    let calls = 0;
    await page.route("**/api/evaluate", async (route) => {
      calls++;
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.getByLabel("IP to evaluate").fill("Double Submit Probe");
    const button = page.getByRole("button", { name: /Evaluate|Researching/ });
    await button.click();
    await button.click({ force: true }).catch(() => {});
    await button.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);

    expect(calls).toBe(1);
    await expect(page.locator(".error")).toBeVisible({ timeout: 15_000 });
    expect(calls).toBe(1);
    await page.unroute("**/api/evaluate");
  });

  test("the Evaluate button disables and relabels while researching", async ({ page }) => {
    await page.goto("/");
    await page.route("**/api/evaluate", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    await page.getByLabel("IP to evaluate").fill("Busy State Probe");
    await page.getByRole("button", { name: "Evaluate" }).click();
    await expect(page.getByRole("button", { name: "Researching…" })).toBeDisabled();

    await expect(page.getByRole("button", { name: "Evaluate" })).toBeEnabled({ timeout: 15_000 });
    await page.unroute("**/api/evaluate");
  });
});
