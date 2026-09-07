import { test, expect } from "@playwright/test";
import { captureConsole, decisionId } from "./helpers";

test.describe("Console cleanliness", () => {
  // UX-01
  test("no console errors or warnings on any route", async ({ page, request }) => {
    const floor = await decisionId(request, "The Expanse", "PASS");
    const pursue = await decisionId(request, "Dune: Messiah");
    const watch = await decisionId(request, "Seveneves");

    const messages = captureConsole(page);
    const routes = {
      "command center": "/",
      "evidence graph": `/decisions/${floor}`,
      "stress test (flip)": `/decisions/${watch}/stress-test`,
      "stress test (floor)": `/decisions/${floor}/stress-test`,
      "stress test (pursue)": `/decisions/${pursue}/stress-test`,
      timeline: `/decisions/${floor}/timeline`,
      "unknown route": "/totally/unknown",
    };

    for (const [name, path] of Object.entries(routes)) {
      messages.length = 0;
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(messages, `${name} logged: ${messages.join(" | ")}`).toEqual([]);
    }
  });

  test("interacting with the graph and the watch action logs nothing", async ({ page, request }) => {
    const floor = await decisionId(request, "The Expanse", "PASS");
    const messages = captureConsole(page);

    await page.goto(`/decisions/${floor}`);
    await page.locator(".g-node").first().click();
    await page.locator(".g-node").nth(1).click();
    await page.keyboard.press("Escape");

    await page.goto("/");
    await page.locator(".card").first().getByRole("button", { name: /Watch/ }).click();
    await expect(page.locator(".notice")).toBeVisible();

    expect(messages, `logged: ${messages.join(" | ")}`).toEqual([]);
  });
});
