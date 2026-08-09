import { test, expect } from "@playwright/test";
import { decisionId } from "./helpers";

test.describe("Evidence Graph", () => {
  test("renders nodes and reveals provenance when a node is clicked", async ({
    page,
    request,
  }) => {
    const id = await decisionId(request, "The Expanse", "PASS");
    await page.goto(`/decisions/${id}`);

    await expect(
      page.getByRole("heading", { name: "The Expanse" })
    ).toBeVisible();

    const nodes = page.locator(".g-node");
    await expect(nodes.first()).toBeVisible();
    await expect(nodes).toHaveCount(5);

    // drift event nodes are part of the graph
    await expect(
      page.locator(".g-node", { hasText: "competing adaptation" }).first()
    ).toBeVisible();

    // click the rights-holder node -> provenance panel
    await page.locator(".g-node", { hasText: "Acme Studios" }).click();
    const panel = page.locator(".evidence-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Acme Studios");
    await expect(panel).toContainText("high");
    await expect(panel.locator("dt", { hasText: "Source" })).toBeVisible();

    // the source link carries the provenance URL
    await expect(panel.locator("a")).toHaveAttribute(
      "href",
      "https://deadline.com/2026/01/expanse-option-acme"
    );
  });

  test("event node exposes its publication date and excerpt", async ({
    page,
    request,
  }) => {
    const id = await decisionId(request, "The Expanse", "WATCH");
    await page.goto(`/decisions/${id}`);

    await page
      .locator(".g-node", { hasText: "Major competing adaptation" })
      .first()
      .click();

    const panel = page.locator(".evidence-panel");
    await expect(panel).toContainText("2026");
    await expect(panel.locator("dt", { hasText: "Published" })).toBeVisible();
    await expect(panel.locator(".quote")).toContainText(
      "competing adaptation"
    );
  });
});
