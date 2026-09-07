import { test, expect } from "@playwright/test";
import { decisionRecord, serveRecord } from "./helpers";

test.describe("Empty states", () => {
  // UX-08
  test("an empty decision list explains itself", async ({ page }) => {
    await page.route("**/api/decisions", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" })
    );
    await page.goto("/");
    await expect(page.getByText(/No decisions yet/i)).toBeVisible();
    await expect(page.locator(".card")).toHaveCount(0);
  });

  // UX-08: an evidence graph with no nodes must not be a blank rectangle.
  test("an evidence graph with no nodes shows an explanatory message", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");
    const empty = JSON.parse(JSON.stringify(record));
    empty.evidence.nodes = [];
    empty.evidence.edges = [];

    await serveRecord(page, record.decision_id, empty);
    await page.goto(`/decisions/${record.decision_id}`);

    await expect(page.getByRole("heading", { name: record.ip })).toBeVisible();
    await expect(page.locator(".g-node")).toHaveCount(0);

    const emptyState = page.locator(".graph-empty");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/no evidence/i);
  });

  test("a decision with evidence still renders the graph, not the empty state", async ({ page, request }) => {
    const record = await decisionRecord(request, "The Expanse", "PASS");
    await page.goto(`/decisions/${record.decision_id}`);
    await expect(page.locator(".g-node").first()).toBeVisible();
    await expect(page.locator(".graph-empty")).toHaveCount(0);
  });
});
