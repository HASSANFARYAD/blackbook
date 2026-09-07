import { test, expect } from "@playwright/test";
import { decisionId } from "./helpers";

test.describe("Error handling and resilience", () => {
  // ER-05
  test("a backend 500 shows a user-facing error and never leaks the stack trace", async ({ page }) => {
    await page.route("**/api/decisions", (route) =>
      route.fulfill({
        status: 500,
        contentType: "text/html",
        body:
          "<html><body>Internal Server Error" +
          "<pre>Traceback (most recent call last):\n  File \"/srv/blackbook/agent/store.py\", line 42</pre>" +
          "</body></html>",
      })
    );
    await page.goto("/");

    const error = page.locator(".error");
    await expect(error).toBeVisible();

    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Traceback");
    expect(body).not.toContain("store.py");
    // The page still renders its shell rather than going blank.
    await expect(page.getByRole("heading", { name: "Decision Command Center" })).toBeVisible();
  });

  // ER-06
  test("a network failure shows a human message, not a raw JS error", async ({ page }) => {
    await page.route("**/api/decisions", (route) => route.abort("failed"));
    await page.goto("/");

    const error = page.locator(".error");
    await expect(error).toBeVisible();
    const text = await error.innerText();
    expect(text).not.toContain("TypeError");
    expect(text).not.toMatch(/^Error:/);
    expect(text).not.toContain("Failed to fetch");
    expect(text.length).toBeGreaterThan(10);
  });

  // ER-07
  test("a 404 deep link renders a real page with a heading and a way back", async ({ page }) => {
    for (const path of [
      "/decisions/does-not-exist",
      "/decisions/does-not-exist/stress-test",
      "/decisions/does-not-exist/timeline",
    ]) {
      await page.goto(path);
      await expect(page.locator(".error")).toBeVisible();
      // A heading, so the page is not just a floating red sentence.
      await expect(page.getByRole("heading").first()).toBeVisible();
      // A route back into the app.
      const back = page.getByRole("link", { name: /Command Center/i });
      await expect(back.first()).toBeVisible();
      await back.first().click();
      await expect(page.getByRole("heading", { name: "Decision Command Center" })).toBeVisible();
    }
  });

  test("the 404 message is human, with no JS error prefix", async ({ page }) => {
    await page.goto("/decisions/does-not-exist");
    const text = await page.locator(".error").innerText();
    expect(text).not.toMatch(/^Error:/);
    expect(text).not.toMatch(/^'.*'$/);
  });

  // ER-08 / UX-11
  test("every data-backed route shows a loading state that resolves", async ({ page, request }) => {
    const floor = await decisionId(request, "The Expanse", "PASS");
    const routes = ["/", `/decisions/${floor}`, `/decisions/${floor}/stress-test`, `/decisions/${floor}/timeline`];

    for (const path of routes) {
      // A fixed delay rather than a released gate: unrouting while a handler is
      // still parked makes Playwright discard the route mid-flight.
      await page.route("**/api/**", async (route) => {
        await new Promise((r) => setTimeout(r, 1200));
        await route.continue();
      });

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Loading…").first(), `no loading state on ${path}`).toBeVisible();
      await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15_000 });

      await page.unroute("**/api/**");
    }
  });

  // ER-08, slow-network variant
  test("a slow connection resolves the command center without a blank screen", async ({ page }) => {
    await page.route("**/api/decisions", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Loading…")).toBeVisible();
    await expect(page.locator(".card").first()).toBeVisible({ timeout: 15_000 });
  });
});
