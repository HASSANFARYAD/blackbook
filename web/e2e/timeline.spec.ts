import { test, expect } from "@playwright/test";
import { decisionId } from "./helpers";

test.describe("Decision Drift Timeline", () => {
  test("shows the full PURSUE -> WATCH -> PASS chain with new-evidence markers", async ({
    page,
    request,
  }) => {
    const id = await decisionId(request, "The Expanse", "PASS");
    await page.goto(`/decisions/${id}/timeline`);

    await expect(
      page.getByRole("heading", { name: /Decision Drift/ })
    ).toBeVisible();

    // three linked revisions
    const cards = page.locator(".tl-card");
    await expect(cards).toHaveCount(3);

    // each transition is marked with NEW EVIDENCE
    await expect(page.locator(".tl-event")).toHaveCount(2);
    await expect(
      page.locator(".tl-event", { hasText: "Major competing adaptation" }).first()
    ).toBeVisible();
    await expect(
      page.locator(".tl-event", { hasText: "Rights holder sold option" }).first()
    ).toBeVisible();

    // newest revision is flagged CURRENT
    await expect(page.locator(".tag-current")).toBeVisible();

    // recommendations progress PASS (newest) -> WATCH -> PURSUE (oldest)
    const recs = await cards.locator(".chip").allInnerTexts();
    expect(recs[0]).toContain("PASS");
    expect(recs[1]).toContain("WATCH");
    expect(recs[2]).toContain("PURSUE");
  });
});
