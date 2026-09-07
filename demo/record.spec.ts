import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { clickTarget, ensureOverlay, glide, hideCursor, highlight, installOverlay, moveTo } from "./cursor";

// Paths come from the orchestrator (demo/build.mjs) so this file stays free of
// any import.meta / __dirname assumption about how Playwright loaded it.
const OUTPUT_DIR = process.env.DEMO_OUTPUT_DIR ?? path.join(process.cwd(), "demo", "output");
const AUDIO_DURATIONS_FILE = path.join(OUTPUT_DIR, "audio-durations.json");
const SCENES_FILE = path.join(OUTPUT_DIR, "scenes.json");

/**
 * The BLACKBOOK demo recording.
 *
 * One test, nine scenes, no splicing: if any scene assertion fails the whole take
 * aborts so a broken frame can never reach the cut. Scene boundaries are measured
 * at runtime and written to scenes.json, which then drives both the audio mux and
 * the subtitle track -- the video is never retimed to fit the narration.
 *
 * Scene phases:
 *   enter        cheap positioning. Nothing is narrated yet.
 *   assertReady  proves the frame is presentable before a word is spoken.
 *   -- narration starts here --
 *   hold         the scene's actual business: navigation, clicks, scrolling.
 *   assert       full verification, re-run at the moment we cut away.
 *
 * Navigation deliberately lives in `hold`, not `enter`. Waiting for a route change
 * in silence produced 2-3.5s of dead air on every transition; letting the narration
 * play over the movement removes it, and "explain why while the screen shows what"
 * is the better read anyway.
 */

interface SceneSpec {
  id: string;
  feature: string;
  enter?: (page: Page, ctx: Ctx) => Promise<void>;
  assertReady?: (page: Page, ctx: Ctx) => Promise<void>;
  hold?: (page: Page, ctx: Ctx, audioMs: number) => Promise<void>;
  assert: (page: Page, ctx: Ctx) => Promise<void>;
}

interface Ctx {
  expansePassId: string;
  duneId: string;
}

const PACING_TAIL_MS = 400; // a beat at the end of every scene, inside the dead-air budget

const card = (page: Page, ip: string, rec?: string) => {
  let locator = page.getByTestId("decision-card").filter({ hasText: ip });
  if (rec) locator = locator.filter({ hasText: rec });
  return locator;
};

const scenes: SceneSpec[] = [
  {
    id: "01-intro",
    feature: "Problem framing",
    enter: async (page) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Decision Command Center" })).toBeVisible();
      await glide(page, 0, 200);
    },
    assert: async (page) => {
      await expect(page.getByRole("heading", { name: "Decision Command Center" })).toBeVisible();
      await expect(page.getByLabel("IP to evaluate")).toBeVisible();
    },
  },
  {
    id: "02-command-center",
    feature: "Decision Command Center",
    enter: async (page) => {
      await expect(page.getByTestId("decision-card").first()).toBeVisible();
    },
    hold: async (page) => {
      await glide(page, 430, 2400);
    },
    assert: async (page) => {
      await expect(page.getByTestId("decision-card")).toHaveCount(5);
      const recommendations = await page.getByTestId("recommendation").allInnerTexts();
      expect(recommendations).toEqual(expect.arrayContaining(["PURSUE", "WATCH", "PASS"]));
    },
  },
  {
    id: "03-deterministic",
    feature: "Deterministic decision engine",
    assertReady: async (page) => {
      await expect(card(page, "Dune: Messiah").getByTestId("score-value")).toBeVisible();
    },
    hold: async (page, _ctx, audioMs) => {
      const dune = card(page, "Dune: Messiah");
      await moveTo(page, dune.getByTestId("score-value"), 700);
      await highlight(page, dune.getByTestId("score-value"));
      // The ring now carries the focus, so retire the cursor rather than leave it
      // sitting on top of the very number the narration is talking about.
      await hideCursor(page);
      // Sit on the score for the first stretch, then move the ring onto the four
      // components that produced it as the narration reaches them.
      await page.waitForTimeout(Math.max(0, Math.round(audioMs * 0.4)));
      await highlight(page, dune.getByTestId("component-bars"));
    },
    assert: async (page) => {
      const dune = card(page, "Dune: Messiah");
      await expect(dune.getByTestId("score-value")).toHaveText("86");
      await expect(dune.getByTestId("recommendation")).toHaveText("PURSUE");
    },
  },
  {
    id: "04-evidence",
    feature: "Evidence graph",
    assertReady: async (page) => {
      await expect(card(page, "The Expanse", "PASS")).toBeVisible();
    },
    hold: async (page, ctx) => {
      await highlight(page, null);
      await clickTarget(page, card(page, "The Expanse", "PASS").getByRole("link", { name: "Evidence" }), 700);
      await page.waitForURL(`**/decisions/${ctx.expansePassId}`);
      await ensureOverlay(page);
      await hideCursor(page);
      await expect(page.getByTestId("evidence-graph")).toBeVisible();
    },
    assert: async (page) => {
      await expect(page.getByTestId("evidence-graph")).toBeVisible();
      await expect(page.getByTestId("evidence-graph").getByRole("button")).toHaveCount(5);
    },
  },
  {
    id: "05-evidence-node",
    feature: "Provenance panel",
    assertReady: async (page) => {
      await expect(
        page.getByTestId("evidence-graph").getByRole("button", { name: /Rights holder sold option/ })
      ).toBeVisible();
    },
    hold: async (page) => {
      const node = page
        .getByTestId("evidence-graph")
        .getByRole("button", { name: /Rights holder sold option/ });
      await highlight(page, node);
      await clickTarget(page, node, 700);
      await expect(page.getByTestId("evidence-panel")).toBeVisible();
      await highlight(page, null);
      await glide(page, 220, 900);
    },
    assert: async (page) => {
      const panel = page.getByTestId("evidence-panel");
      await expect(panel).toBeVisible();
      for (const field of ["Source", "Published", "Observed", "Confidence", "Excerpt"]) {
        await expect(panel.getByText(field, { exact: true })).toBeVisible();
      }
      await expect(panel.getByRole("link")).toHaveAttribute("href", /^https:/);
    },
  },
  {
    id: "06-counterfactual",
    feature: "Counterfactual stress test",
    assertReady: async (page) => {
      await expect(page.getByTestId("evidence-panel")).toBeVisible();
    },
    hold: async (page) => {
      await clickTarget(page, page.getByRole("link", { name: "Command Center" }), 550);
      await expect(page.getByTestId("decision-card").first()).toBeVisible();
      await clickTarget(page, card(page, "Dune: Messiah").getByRole("link", { name: "Stress Test" }), 700);
      await page.waitForURL(/stress-test/);
      await ensureOverlay(page);
      await hideCursor(page);
      await expect(page.getByTestId("flip-banner")).toBeVisible();
      await highlight(page, page.getByTestId("flip-banner"));
    },
    assert: async (page) => {
      const banner = page.getByTestId("flip-banner");
      await expect(banner).toContainText("Minimum detected flip");
      await expect(banner).toContainText("Market opportunity -30 points");
    },
  },
  {
    id: "07-floor",
    feature: "No reachable flip",
    assertReady: async (page) => {
      await expect(page.getByTestId("flip-banner")).toBeVisible();
    },
    hold: async (page, ctx) => {
      await highlight(page, null);
      await clickTarget(page, page.getByRole("link", { name: "Command Center" }), 550);
      await expect(page.getByTestId("decision-card").first()).toBeVisible();
      await clickTarget(
        page,
        card(page, "The Expanse", "PASS").getByRole("link", { name: "Stress Test" }),
        700
      );
      await page.waitForURL(`**/decisions/${ctx.expansePassId}/stress-test`);
      await ensureOverlay(page);
      await hideCursor(page);
      await highlight(page, page.getByTestId("flip-banner"));
    },
    assert: async (page) => {
      await expect(page.getByTestId("flip-banner")).toContainText("No reachable flip");
      await expect(page.getByRole("heading", { name: "Margin erosion" })).toBeVisible();
      await expect(page.getByText("Minimum detected flip")).toHaveCount(0);
    },
  },
  {
    id: "08-drift",
    feature: "Decision drift monitoring",
    assertReady: async (page) => {
      await expect(page.getByTestId("flip-banner")).toBeVisible();
    },
    hold: async (page, ctx) => {
      await highlight(page, null);
      await clickTarget(page, page.getByRole("link", { name: "Timeline" }), 650);
      await page.waitForURL(`**/decisions/${ctx.expansePassId}/timeline`);
      await ensureOverlay(page);
      await hideCursor(page);
      await expect(page.getByTestId("timeline-card").first()).toBeVisible();
      await glide(page, 0, 200);
    },
    assert: async (page) => {
      await expect(page.getByTestId("timeline-card")).toHaveCount(3);
      await expect(page.getByText("NEW EVIDENCE", { exact: true })).toHaveCount(2);
      await expect(page.getByText("CURRENT", { exact: true })).toBeVisible();
    },
  },
  {
    id: "09-close",
    feature: "Decision timeline",
    assertReady: async (page) => {
      await expect(page.getByTestId("timeline-card").first()).toBeVisible();
    },
    hold: async (page) => {
      await glide(page, 760, 3400);
    },
    assert: async (page) => {
      const chips = await page.getByTestId("timeline-card").getByTestId("rec-chip").allInnerTexts();
      expect(chips.map((c) => c.trim())).toEqual(["PASS", "WATCH", "PURSUE"]);
      await expect(page.getByTestId("timeline-card").last()).toBeInViewport();
    },
  },
];

test("BLACKBOOK demo recording", async ({ page, context, request }) => {
  test.setTimeout(8 * 60 * 1000);

  const audioDurations: Record<string, number> = fs.existsSync(AUDIO_DURATIONS_FILE)
    ? JSON.parse(fs.readFileSync(AUDIO_DURATIONS_FILE, "utf-8"))
    : {};
  const dryRun = process.env.DEMO_DRY_RUN === "1";

  // A single console error anywhere in the take invalidates it.
  const consoleProblems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") consoleProblems.push(`[${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => consoleProblems.push(`[pageerror] ${e.message}`));

  await installOverlay(page);

  const decisions = await (await request.get("/api/decisions")).json();
  const find = (ip: string, rec?: string) =>
    decisions.find((d: any) => d.ip === ip && (!rec || d.recommendation === rec)).decision_id;
  const ctx: Ctx = { expansePassId: find("The Expanse", "PASS"), duneId: find("Dune: Messiah") };

  const epoch = Date.now();
  const at = () => Date.now() - epoch;
  const timeline: Record<string, unknown>[] = [];

  for (const scene of scenes) {
    const startMs = at();
    if (scene.enter) await scene.enter(page, ctx);
    await (scene.assertReady ?? scene.assert)(page, ctx);

    // Narration begins only once the frame is settled and proven presentable.
    const audioStartMs = at();
    const audioSeconds = audioDurations[scene.id] ?? 2;
    const audioMs = Math.round(audioSeconds * 1000);

    if (scene.hold) await scene.hold(page, ctx, audioMs);

    // Hold the scene for at least the narration length, plus a pacing beat.
    const remaining = audioMs + PACING_TAIL_MS - (at() - audioStartMs);
    if (remaining > 0) await page.waitForTimeout(remaining);

    // The scene must still be correct at the moment we cut away.
    await scene.assert(page, ctx);
    const endMs = at();

    timeline.push({
      id: scene.id,
      feature: scene.feature,
      startMs,
      audioStartMs,
      endMs,
      durationMs: endMs - startMs,
      audioSeconds,
    });
    process.stdout.write(
      `  ${scene.id.padEnd(20)} lead ${((audioStartMs - startMs) / 1000).toFixed(1)}s  ` +
        `narrated ${((endMs - audioStartMs) / 1000).toFixed(1)}s  -> ${(endMs / 1000).toFixed(1)}s\n`
    );
  }

  expect(consoleProblems, `console output during the take: ${consoleProblems.join(" | ")}`).toEqual([]);

  const totalMs = at();
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  if (!dryRun) {
    await context.close(); // flushes the webm
    fs.writeFileSync(
      SCENES_FILE,
      JSON.stringify({ recordedAt: new Date().toISOString(), totalMs, scenes: timeline }, null, 2)
    );
  } else {
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "scenes.dryrun.json"),
      JSON.stringify({ totalMs, scenes: timeline.map(({ id, feature }) => ({ id, feature })) }, null, 2)
    );
  }
});
