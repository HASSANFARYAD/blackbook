import { test, expect } from "@playwright/test";
import type { DecisionRecord, WatchResult } from "../src/types";
import { fetchDecisions } from "./helpers";

const NEW_IP = "The Ministry for the Future";

const baseRecord: DecisionRecord = {
  ip: NEW_IP,
  recommendation: "PURSUE",
  score: 82,
  component_scores: {
    opportunity: 85,
    rights_confidence: 90,
    competition: 25,
    production_feasibility: 80,
  },
  reasoning_summary: "Mocked E2E evaluation.",
  decision_id: "e2e-decision-1",
  evidence: {
    ip: NEW_IP,
    nodes: [],
    edges: [],
  },
  status: "active",
  created_at: "2026-08-22T10:00:00Z",
  previous_decision_id: null,
  monitor_id: "mon-e2e",
  research: {
    search: true,
    extract: true,
    deep_task: true,
    monitor: true,
    completeness: 1,
  },
  consumed_event_ids: [],
};

const watchResult: WatchResult = {
  decision_id: "e2e-decision-1",
  drifted: true,
  events_checked: 1,
  evaluation: {
    decision_id: "e2e-decision-1",
    drifted: true,
    new_events: ["Competing project announced"],
    changed_factors: ["competition"],
    impact: "A competing project was announced, increasing competition.",
    re_evaluate: true,
  },
  new_record: {
    ...baseRecord,
    decision_id: "e2e-decision-2",
    recommendation: "WATCH",
    score: 67,
    status: "drift_re_evaluated",
    previous_decision_id: "e2e-decision-1",
    consumed_event_ids: ["id:evt-2"],
  },
};

test("evaluate then watch creates a linked drift revision in the UI", async ({
  page,
  request,
}) => {
  const seeded = await fetchDecisions(request);

  // The mocked list grows as evaluate/watch succeed, so the UI's refresh
  // reflects the new decisions.
  let list: DecisionRecord[] = seeded;

  await page.route("**/evaluate", (route) => {
    list = [baseRecord, ...list];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(baseRecord),
    });
  });

  await page.route("**/watch", (route) => {
    list = [watchResult.new_record!, ...list];
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(watchResult),
    });
  });

  await page.route("**/decisions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(list),
    })
  );

  await page.goto("/");

  // evaluate a fresh IP
  await page.getByLabel("IP to evaluate").fill(NEW_IP);
  await page.getByRole("button", { name: "Evaluate" }).click();

  await expect(page.locator(".notice")).toContainText("PURSUE");

  const newCard = page.locator(".card", { hasText: NEW_IP }).first();
  await expect(newCard).toBeVisible();
  await expect(newCard.locator(".gauge-rec", { hasText: "PURSUE" })).toBeVisible();

  // watch for drift -> linked revision appears
  await newCard.getByRole("button", { name: "Watch" }).click();

  await expect(page.locator(".notice")).toContainText("Drift detected");
  await expect(page.locator(".notice")).toContainText("WATCH");

  const revision = page.locator(".card", { hasText: NEW_IP }).first();
  await expect(revision.locator(".gauge-rec", { hasText: "WATCH" })).toBeVisible();
});
