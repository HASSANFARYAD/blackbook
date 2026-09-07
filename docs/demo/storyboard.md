# BLACKBOOK — Demo Storyboard

Nine scenes, 2:23, 1920×1080. Recorded by `demo/record.spec.ts` against a seeded, fully offline
instance. Narration text is authoritative in `demo/narration.json`; the excerpts below are for
reading the board.

**Scene arc.** Every scene follows *hook → action → result → why it matters → transition*. The
column "Beat" names which part of that arc the scene is carrying, because not every beat needs a
full pass — Scene 04 is almost pure transition, Scene 03 is almost pure "why it matters".

**Timing model.** Each scene runs `enter` → `assertReady` → *narration starts* → `hold` → `assert`.
`enter` is cheap positioning; `assertReady` proves the frame is presentable before a word is
spoken; `hold` carries the scene's actual business — navigation, clicks, scrolling — under the
narration; `assert` re-verifies at the moment we cut away. The scene runs at least as long as its
narration clip plus a 0.4s pacing beat. Video is never sped up or slowed to fit audio. Measured
boundaries are written to `demo/output/scenes.json` at runtime and drive both the mux and the
`.srt`.

Navigation sits in `hold` rather than `enter` on purpose. An earlier cut waited for each route
change in silence and produced 2.0–3.6s of dead air on five of the nine transitions; letting the
narration play over the movement removed all of it and shortened the cut by 14s. It also reads
better — the voice explains *why* while the screen shows *what*.

**Locator policy.** `getByRole` / `getByLabel` / `getByTestId` only. No CSS or XPath chains, no
`nth-child`. Where the app had no role to target, a `data-testid` was added to the component
rather than reaching into class names.

---

| # | Feature | Beat | On-screen action | Narration (excerpt) | Target | Success assertion |
|---|---|---|---|---|---|---|
| 01 | Problem framing | Hook | Land on `/`. Page settles at the top, hero and evaluate form in frame. No cursor movement — the viewer is listening, not watching. | "A studio development team decides whether to chase a book, a comic, or a format… watches for the moment that call stops being right." | 22.6s | `getByRole("heading", { name: "Decision Command Center" })` visible **and** `getByLabel("IP to evaluate")` visible |
| 02 | Decision Command Center | Action → Result | Smooth 2.4s glide down to the decision grid. Cursor rests. All five decision cards in frame. | "Every decision the system has ever made is here… market opportunity, rights confidence, competition, and production feasibility." | 17.4s | `getByTestId("decision-card")` count `= 5`; the set of `getByTestId("recommendation")` texts contains PURSUE, WATCH **and** PASS |
| 03 | Deterministic engine | Why it matters | Highlight ring on the *Dune: Messiah* card — its score gauge, then its four component bars. No navigation; the claim is verbal, the screen is the evidence. | "Gemini scores those four components… The model explains; the system decides. The same inputs always produce the same decision." | 20.0s | Within the Dune card, `getByTestId("score-value")` has text `86` and `getByTestId("recommendation")` has text `PURSUE` |
| 04 | Evidence graph | Transition | Cursor travels to the *Evidence* link on **The Expanse** (PASS) card and clicks once. Route change to `/decisions/:id`. Graph renders. | "Behind every decision is an evidence graph. Each claim is a node with a typed relationship to another…" | 9.7s | URL matches `/decisions/<id>`; `getByTestId("evidence-graph")` visible; exactly `5` node buttons present |
| 05 | Provenance panel | Result → Why | Cursor travels to the node *"Rights holder sold option to competitor"*, highlight ring, single click. Provenance panel opens below, then a slow 0.9s pan brings it fully into frame while the line finishes. | "Open any node and you get the source, when it was published, when we observed it, a confidence level, and the exact sentence… Nothing in a decision is unattributed." | 12.7s | `getByTestId("evidence-panel")` visible and contains `Published`, `Observed`, `Confidence` and a non-empty quote; its source link has an `https:` href |
| 06 | Counterfactual stress test | Hook → Action → Result | Click *Command Center* breadcrumb, then *Stress Test* on the Dune card. Land on the counterfactual. Highlight the flip banner. | "The stress test asks what would have to change for this call to flip… The smallest change that moves this off pursue is a thirty point drop in market opportunity." | 18.3s | `getByTestId("flip-banner")` contains the exact string `Market opportunity -30 points` **and** `Minimum detected flip` |
| 07 | No reachable flip | Why it matters | Breadcrumb back, then *Stress Test* on The Expanse (PASS) card. Highlight the banner. | "When nothing can flip a recommendation, the system says so. It reports how much margin is left instead of inventing a change that does not exist." | 10.0s | `getByTestId("flip-banner")` contains `No reachable flip`; `getByRole("heading", { name: "Margin erosion" })` visible; no element with text `Minimum detected flip` |
| 08 | Decision drift | Hook → Action | Cursor to the *Timeline* link, single click. Timeline renders at the top, newest revision (PASS, CURRENT) in frame. | "Decisions do not stay correct. A Parallel monitor watches the web for events touching this property… tested for materiality before anything changes." | 16.9s | `getByTestId("timeline-card")` count `= 3`; exactly `2` `NEW EVIDENCE` markers; the `CURRENT` tag is visible |
| 09 | Decision timeline | Result → Why | Slow 3.4s glide down the full lineage, ending with the original PURSUE revision in frame. Hold on the footer line. | "The result is a decision that keeps a memory… Three linked revisions, every one evidenced and explained." | 15.2s | Recommendation chips on the three timeline cards read `PASS`, `WATCH`, `PURSUE` top to bottom; the oldest card is in the viewport at scene end |

**Measured total 2:23** against a 3:00 hard ceiling; the durations above are measured, not
estimated. The build aborts if the narration alone exceeds 175s.

---

## Pre-recording gate

The recorder refuses to run unless all of these hold. Verified results are in the final summary.

| Gate | How it is enforced |
|---|---|
| Full test suite green | `pytest` and the 63-case Playwright suite are run by `demo/build.mjs` before recording; a non-zero exit aborts. |
| Zero console errors on every demo route | The recorder attaches a console listener for the whole run and fails the take if any `error` or `warning` fires. |
| Deterministic seed data | `BLACKBOOK_SEED_DEMO=1` against a throwaway DB. Five records with realistic trade-press names (Deadline, Variety, THR) and plausible scores. No lorem ipsum, no placeholder text, no real customer data. |
| External calls stubbed | The recording server runs with `GOOGLE_API_KEY=""` and no `PARALLEL_API_KEY`. Nothing in the demo path makes a network call, so the run is byte-identical between takes. |
| Clean browser profile | Playwright launches a fresh Chromium with no extensions, no profile, no bookmark bar, no saved credentials, no notification or cookie prompts. |
| 1920×1080, zoom 100% | Viewport and `recordVideo.size` are both exactly 1920×1080; `deviceScaleFactor: 1`. **Captured natively — never upscaled from a smaller frame.** |
| Two identical back-to-back dry runs | `node demo/build.mjs --dry-run` runs the full scene script twice with assertions on and video off, and compares the two `scenes.json` outputs for scene-order and assertion equality. |

## What this cut deliberately does not show

- **No live agent run.** The Phase 4 requirement is a repeatable, fully stubbed recording, so this
  cut is driven entirely by deterministic seed data. Nothing on screen is a live Gemini or Parallel
  call. This is the correct choice for a regression-grade demo and the wrong choice for the
  hackathon submission, which explicitly requires the agent "functioning as built" — that cut needs
  a live evaluation segment once API keys exist. Flagged in the final summary.
- **No evaluate-and-wait.** Submitting the evaluate form without a Gemini key produces an error
  banner. Showing an error would violate the "no visible errors" rule, so the form is shown but
  never submitted.
- **No 404 or empty states.** Both are now well-handled and covered by tests, but neither belongs
  in a 3-minute pitch.
