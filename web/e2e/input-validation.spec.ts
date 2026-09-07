import { test, expect } from "@playwright/test";
import { horizontalOverflow } from "./helpers";

test.describe("Input handling", () => {
  // IV-04
  test("submitting an empty field fires no request", async ({ page }) => {
    await page.goto("/");
    let calls = 0;
    await page.route("**/api/evaluate", (route) => {
      calls++;
      return route.continue();
    });

    await page.getByRole("button", { name: "Evaluate" }).click();
    await page.getByLabel("IP to evaluate").fill("   ");
    await page.getByRole("button", { name: "Evaluate" }).click();
    await page.waitForTimeout(400);

    expect(calls).toBe(0);
    await expect(page.locator(".error")).toHaveCount(0);
    await page.unroute("**/api/evaluate");
  });

  // IV-05
  test("a 10,000-character IP is handled without breaking the layout", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("IP to evaluate").fill("A".repeat(10_000));
    await page.getByRole("button", { name: "Evaluate" }).click();

    await expect(page.locator(".error")).toBeVisible({ timeout: 15_000 });
    const overflow = await horizontalOverflow(page);
    expect(
      overflow.scrollWidth,
      `layout broke (offenders: ${overflow.offenders.join(", ")})`
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });

  // IV-12
  test("leading and trailing whitespace is trimmed before the request", async ({ page }) => {
    await page.goto("/");
    let sent: string | null = null;
    await page.route("**/api/evaluate", (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}").ip;
      return route.continue();
    });

    await page.getByLabel("IP to evaluate").fill("   The Expanse   ");
    await page.getByRole("button", { name: "Evaluate" }).click();
    await expect(page.locator(".error")).toBeVisible({ timeout: 15_000 });

    expect(sent).toBe("The Expanse");
    await page.unroute("**/api/evaluate");
  });

  // IV-06: unicode in the evaluate field round-trips to the request unchanged.
  test("unicode, emoji and RTL input reach the API intact", async ({ page }) => {
    await page.goto("/");
    let sent: string | null = null;
    await page.route("**/api/evaluate", (route) => {
      sent = JSON.parse(route.request().postData() ?? "{}").ip;
      return route.continue();
    });

    const value = "مرحبا 🎬 Дюна";
    await page.getByLabel("IP to evaluate").fill(value);
    await page.getByRole("button", { name: "Evaluate" }).click();
    await expect(page.locator(".error")).toBeVisible({ timeout: 15_000 });

    expect(sent).toBe(value);
    await page.unroute("**/api/evaluate");
  });

  test("the field is cleared only on success, so a failed submit keeps the input", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("IP to evaluate").fill("Retryable Title");
    await page.getByRole("button", { name: "Evaluate" }).click();
    await expect(page.locator(".error")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel("IP to evaluate")).toHaveValue("Retryable Title");
  });
});
