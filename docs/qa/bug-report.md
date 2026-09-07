# BLACKBOOK — Bug Report

Twelve defects found, twelve fixed, each with a regression test and its own commit.
Every finding below was reproduced against a running instance before being logged; nothing
here is inferred from reading the code alone.

| ID | Severity | Area | Title | Status |
|---|---|---|---|---|
| BUG-01 | High | API | SPA catch-all shadowed the API: unknown `/api` paths returned `200 text/html` | Fixed `f0e9f94` |
| BUG-02 | Medium | API | `KeyError` repr quoting leaked into 404 `detail` strings | Fixed `1fea6ac` |
| BUG-03 | High | Correctness | "Smallest plausible change" headline was not the smallest change | Fixed `18a2648` |
| BUG-04 | High | Layout | Evidence graph forced the whole document to scroll sideways | Fixed `04e6aa8` |
| BUG-05 | Medium | UX | Evidence graph with no nodes rendered a blank box | Fixed `efad1bb` |
| BUG-06 | Medium | UX | Only the clicked Watch button disabled; the rest silently no-opped | Fixed `dc1c172` |
| BUG-07 | Medium | UX | Users were shown `TypeError: Failed to fetch` | Fixed `4c14727` |
| BUG-08 | Medium | UX / a11y | A 404 deep link rendered one red line — no heading, no way back | Fixed `cb73f65` |
| BUG-09 | Low | Security | Unvalidated URL scheme reached the evidence-source `href` | Fixed `7257437` |
| BUG-10 | Low | a11y | Evidence panel could not be dismissed | Fixed `254565c` |
| BUG-11 | Low | a11y | `.tag` text at 4.41:1, under the 4.5:1 AA floor | Fixed `254565c` |
| BUG-12 | Low | a11y | Heading order skipped `h2` on two pages | Fixed `254565c` |

Three additional test failures during execution were **bad tests, not product bugs**, and were
fixed as tests — see "Test defects" at the end. No assertion was weakened to turn a suite green.

---

## BUG-01 — High — SPA catch-all shadowed the entire API surface

**Reproduce**
```
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:8791/api/nope
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://127.0.0.1:8791/api/evaluate
```

**Expected** `404 application/json` for an unknown endpoint; `405` for a wrong method.

**Actual (before)**
```
GET   /api/nope                    -> 200 text/html    <!doctype html><html lang="en">…
GET   /api/evaluate                -> 200 text/html    <!doctype html><html lang="en">…
```

**Root cause** `@app.get("/{full_path:path}")` matches `/api/...` as well as UI routes. In
Starlette's router a **full** match wins over the **partial** (path-matches, method-doesn't) match
that produces a 405, and the catch-all was registered after the API router — so every unmatched
API request, and every method mismatch on a real endpoint, was served the SPA shell with a 200.
Any client doing `res.json()` on that gets a parse error instead of the real status.

**Fix** `app/api.py` — replaced the catch-all route with a 404 exception handler plus an explicit
`GET /`. With no route left to shadow them, unmatched `/api` paths reach a JSON 404 and method
mismatches reach Starlette's own 405, while unmatched UI paths still receive `index.html`.

**Files** `app/api.py`

**Verification (after)**
```
GET   /api/nope                    -> 404 application/json    {"detail":"Not Found"}
GET   /api/evaluate                -> 405 application/json    {"detail":"Method Not Allowed"}
GET   /totally/unknown             -> 200 text/html           <!doctype html>…
GET   /                            -> 200 text/html           <!doctype html>…
```
Regression tests: `api-contract.spec.ts` — four cases covering unknown, unknown-nested,
wrong-method, and the SPA path that must keep working.

---

## BUG-02 — Medium — Python `repr` quoting leaked into API error messages

**Reproduce** `curl -X POST /api/watch -d '{"decision_id":"nope"}'`

**Expected** `{"detail":"decision nope not found"}`, matching `/api/decisions/{id}`.

**Actual (before)** `{"detail":"'decision nope not found'"}` — note the embedded apostrophes,
which the UI rendered verbatim.

**Root cause** `KeyError.__str__` returns the **repr** of `args[0]`, so `str(KeyError("decision x
not found"))` is `"'decision x not found'"`. `/watch` and `/counterfactual` passed that into
`HTTPException(detail=...)`. `/decisions/{id}` used a string literal instead, so the same condition
produced two different messages depending on which endpoint you hit.

**Fix** `_not_found_detail()` reads `exc.args[0]` rather than stringifying the exception.

**Files** `app/api.py`

**Verification (after)**
```
POST  /api/watch          -> 404 {"detail":"decision nope not found"}
POST  /api/counterfactual -> 404 {"detail":"decision nope not found"}
GET   /api/decisions/nope -> 404 {"detail":"decision not found"}
```
Regression test: `api-contract.spec.ts` › "missing records return 404 with an unquoted detail
sentence" asserts `detail` never matches `/^'.*'$/` across all four not-found paths.

---

## BUG-03 — High — the counterfactual headline was not the smallest change

This is the most serious finding, because it contradicts the product's central claim and the
demo narration ("the system decides, deterministically, and we show our work").

**Reproduce**
```python
from agent.schemas import ComponentScores
from agent.counterfactual import analyze
analyze(ComponentScores(opportunity=100, rights_confidence=62,
                        competition=0, production_feasibility=100))
```

**Expected** The stress-test banner reads *"The smallest plausible change that moves this off
PURSUE"*, so it must show the smallest flip — here **Rights confidence −10**.

**Actual (before)** Scenario order was the declaration order of `DIRECTIONS`:
```
Market opportunity -40 points        -> WATCH  77     <- shown as "the smallest plausible change"
Rights confidence -10 points         -> WATCH  86     <- actually the smallest
Production feasibility -50 points    -> WATCH  79
Competition pressure +50 points      -> WATCH  79
```
The UI compounded it: `flips.find(s => s.projected_recommendation === "PASS")` preferred the most
*severe* flip over the smallest one, falling back to `flips[0]` — neither of which is a minimum.

**Root cause** Two independent ordering bugs. `find_flip_scenarios` iterated components in dict
order and appended, never ranking by swing size. The UI then picked by severity, not size. The
seeded fixture hid both: for Dune, Seveneves and the Expanse chain, the first-listed component
happens to also be the smallest, so no existing test could catch it.

**Fix** Both sides, so the claim does not depend on either alone:
- `find_flip_scenarios` returns flips sorted smallest-swing-first (stable, so equal magnitudes keep
  declared order).
- `CounterfactualScenario` gained an explicit signed `delta`, and `StressTest.tsx` ranks from that
  rather than trusting response order or parsing magnitude back out of the label text.

**Files** `agent/counterfactual.py`, `agent/schemas.py`, `web/src/pages/StressTest.tsx`,
`web/src/types.ts`

**Verification (after)**
```
score 89 PURSUE
  Rights confidence -10 points     -> WATCH   86     <- now the headline
  Market opportunity -40 points    -> WATCH   77
  Production feasibility -50 points-> WATCH   79
  Competition pressure +50 points  -> WATCH   79
```
Regression tests: three pytest cases (`test_flip_scenarios_are_ordered_smallest_swing_first`,
`test_smallest_flip_wins_even_when_a_larger_swing_is_more_severe`,
`test_ties_keep_a_stable_declared_order`) and two Playwright cases, one of which feeds the UI a
**deliberately unsorted** API response to prove the UI ranks independently.

---

## BUG-04 — High — the evidence graph pushed the whole page sideways

**Reproduce** Load `/decisions/{expanse-PASS}` at 768×1024 or 375×667.

**Expected** `document.documentElement.scrollWidth <= clientWidth`; the graph pans inside its own
container.

**Actual (before)**
```
OVERFLOW 768x1024 /decisions/:id: scrollW=1184 clientW=768   div.graph-wrap@right=1184
OVERFLOW 375x667  /decisions/:id: scrollW=1180 clientW=375   div.graph-wrap@right=1180
400 nodes at 1440px: graph 1462px wide; docScrollW=1620 clientW=1440
```

**Root cause** `.graph-wrap` correctly had `overflow: auto`, but `EvidenceGraphView` also applied
the computed graph width as an **inline style on the same element**. A scroll container that is
itself wider than the viewport cannot clip anything, so the overflow escaped to the document. The
CSS and the component were each half-right and cancelled out.

**Fix** Split the two roles: `.graph-wrap` is sized by the layout (`max-width: 100%`,
`max-height: 70vh`, `overflow: auto`) and a new inner `.graph-canvas` carries the computed
width/height that the absolutely-positioned nodes lay out against.

**Files** `web/src/components/EvidenceGraphView.tsx`, `web/src/styles.css`

**Verification (after)** All four viewports × four routes pass; the 400-node graph keeps
`docScrollWidth <= clientWidth` while `.graph-wrap.scrollWidth > .graph-wrap.clientWidth`, proving
it scrolls internally rather than being clipped. Regression tests: `responsive.spec.ts`, 6 cases.

---

## BUG-05 — Medium — an evidence graph with no nodes was a blank box

**Reproduce** Serve a decision whose `evidence.nodes` is `[]`.

**Expected** An explanatory empty state.

**Actual (before)** A 286×148 bordered rectangle containing nothing at all —
`innerText` was `""`. Indistinguishable from a rendering failure.

**Root cause** `EvidenceGraphView` mapped over `graph.nodes` with no zero-length branch.

**Fix** Render a `.graph-empty` message when the graph has no nodes.

**Files** `web/src/components/EvidenceGraphView.tsx`, `web/src/styles.css`

**Verification** `empty-states.spec.ts` — asserts the message appears when empty *and* that a
populated graph still renders nodes rather than the empty state.

---

## BUG-06 — Medium — only the clicked Watch button disabled

**Reproduce** Delay `/api/watch`, click Watch on the first card, inspect the others.

**Expected** Every Watch button disabled while one is running.

**Actual (before)**
```
card0: text="Checking…" disabled=true
card1: text="Watch"     disabled=false
card2: text="Watch"     disabled=false
card3: text="Watch"     disabled=false
card4: text="Watch"     disabled=false
```
Clicking any of those returned immediately from `watch()`'s `if (watchBusyId) return` guard — a
fully enabled button that silently does nothing.

**Root cause** The handler enforced single-flight, but `DecisionCard` only received `watchBusy`
for its own id, so the UI never reflected the guard.

**Fix** Pass `anyWatchBusy` alongside `watchBusy`; the button disables on the former.

**Files** `web/src/components/DecisionCard.tsx`, `web/src/pages/CommandCenter.tsx`

**Verification** `in-flight.spec.ts` asserts every card's button is disabled during another card's
watch, and re-enables afterwards.

---

## BUG-07 — Medium — raw JS errors shown to users

**Reproduce** Abort `/api/decisions`; separately, load a nonexistent decision.

**Expected** A sentence a user can act on.

**Actual (before)**
```
offline  .error: "TypeError: Failed to fetch"
404      .error: "Error: decision not found"
500      .error: "Error: Internal Server Error"
```

**Root cause** Every catch was `setError(String(err))`. The JS class name is noise for the API
cases and actively misleading for the network case, which has no server-side detail behind it.

**Fix** `errorMessage()` in `format.ts`: a `TypeError` becomes "Could not reach the BLACKBOOK
service. Check that it is running, then try again."; everything else has its `<Class>Error:` prefix
stripped so the server's own `detail` is what shows.

**Files** `web/src/format.ts` and all four pages

**Verification** `error-states.spec.ts` asserts the message contains no `TypeError`, no
`Failed to fetch`, and no `^Error:` prefix — and separately that a 500's traceback body never
reaches the DOM.

---

## BUG-08 — Medium — a 404 deep link was a dead end with no heading

**Reproduce** Load `/decisions/does-not-exist` (and the `/stress-test`, `/timeline` variants).

**Expected** An identifiable page with a heading and a route back.

**Actual (before)** The entire page body was:
```
BLACKBOOK IP DEVELOPMENT INTELLIGENCE  Error: decision not found  Research an IP · Make a decision…
```
`document.querySelectorAll("h1")` returned **zero** elements — no heading of any level. No link
back other than the brand mark.

**Root cause** `if (error) return <p className="error">{error}</p>;` in all three detail pages.

**Fix** An `ErrorState` component with a heading, a breadcrumb and a "Back to Command Center"
button, used by all three pages.

**Files** `web/src/components/ErrorState.tsx`, the three detail pages

**Verification** `error-states.spec.ts` walks all three bad deep links, asserts a heading and a
working link back, and clicks it through to the command center.

---

## BUG-09 — Low — unvalidated URL scheme reached the evidence-source `href`

**Reproduce** Serve a node with `source_url: "javascript:window.__xssHref=1"`, open its panel.

**Expected** No `javascript:`/`data:`/`vbscript:` URL in an `href`.

**Actual (before)** `linkHref: "javascript:window.__xssHref=1"` — rendered verbatim into a live
anchor.

**Severity rationale — stated precisely.** I attempted to fire it and **it did not execute**: the
link carries `target="_blank"`, and Chromium refuses `javascript:` URLs opened into a new window
(the popup landed on `about:blank`; `document.title` was unchanged). React also escaped the
markup-bearing fields correctly — an injected `<script>` and an `<img onerror>` both rendered as
text and never ran. So this is a **hardening gap, not a confirmed exploit**, and is logged Low
rather than High. It still warrants a fix: evidence text is LLM-extracted from third-party pages,
the behaviour depends on a browser-specific mitigation, and a bogus clickable link is user-visible
regardless.

**Fix** `safeHref()` returns a URL only for `http:`/`https:`; anything else renders the provenance
as plain text instead of a link.

**Files** `web/src/format.ts`, `web/src/pages/DecisionDetail.tsx`

**Verification** `untrusted-content.spec.ts` sweeps `javascript:`, mixed-case `JaVaScRiPt:`,
`data:` and `vbscript:`, asserting no anchor carries the scheme while the provenance text is still
displayed — plus a companion test that real `https:` sources stay clickable.

---

## BUG-10 / BUG-11 / BUG-12 — Low — accessibility

| | Reproduce | Before | After |
|---|---|---|---|
| **BUG-10** panel not dismissible | Open a node panel, press Escape | Panel still open; `0` close buttons in the panel | Escape closes it; a labelled "Close evidence" button closes it |
| **BUG-11** contrast | Measure `.tag` on `/` | **4.41:1** — `#8b93a7` on a composited `rgb(40,46,61)`, under the 4.5:1 AA floor for 14px | `#949cb0` → **4.81:1** |
| **BUG-12** heading order | Audit heading levels | Evidence page `h1 → h3` (panel); timeline `h1 → h3 → h3 → h3` | Both promoted to `h2`; no level skipped on any route |

**A note on BUG-11.** My first contrast sweep reported six failures. Five were **false positives**
in my own checker, which read `backgroundColor` without compositing alpha — this app styles chips
with `rgba(...)` fills, so a translucent gold chip was measured as opaque gold behind gold text and
scored a nonsense 1:1. I rewrote the checker to composite each translucent background down the
ancestor chain onto an opaque base before measuring; only the 4.41:1 `.tag` failure survived, and
only that one was logged. The corrected checker is what shipped as `contrastFailures()` in
`web/e2e/helpers.ts`, so the suite measures ratios the same way.

**Files** `web/src/pages/DecisionDetail.tsx`, `web/src/pages/Timeline.tsx`, `web/src/styles.css`

**Verification** `a11y.spec.ts` — accessible names, alt text, AA contrast, heading order, keyboard
traversal with visible focus, and panel dismissal by both Escape and button.

---

## Test defects (bad tests, not product bugs)

Three of my new specs failed for reasons that were my fault, not the app's. Each was fixed as a
test; no assertion was relaxed.

1. **`in-flight` × 2, `error-states` × 1 — `route.continue: Route is already handled!`**
   I gated route handlers on a promise and then called `page.unroute()` while a handler was still
   parked, so Playwright discarded the route before `continue()` ran. Replaced the gate with a
   fixed delay, and moved `unroute` after the resolution assertion. The manual audit had already
   shown double-submit was correctly guarded, so treating this as a product bug would have been
   wrong.

2. **`untrusted-content` — `expect(received).not.toMatch` on `null`**
   After the BUG-09 fix there is no anchor at all, so `getAttribute("href")` returned `null` and
   the string matcher errored. Rewrote the assertion to collect every anchor's `href` and assert
   none carries a dangerous scheme — which is the real requirement, and passes both when the link
   is absent and when a safe link is present.

---

## Scope exclusions

Stated explicitly rather than silently skipped:

- **Phase 2.3 (authentication & authorization) has no subject.** BLACKBOOK has no login, session,
  cookie, token, user model or roles. Login states, session expiry, role-boundary checks, IDOR and
  logout invalidation cannot be tested without first inventing an auth layer. In its place the
  suite pins the real trust boundary — rendering of LLM-extracted third-party evidence — and
  records the unauthenticated surface so a future regression is visible (`AZ-01`).
- **Pagination, sorting, filtering and search do not exist** anywhere in the product. `GET
  /api/decisions` returns every row and the UI renders every card. 1,000 cards render in ~1.7 s, so
  it is not a defect today; building the feature is product work, not a QA fix. Recorded as a
  ranked risk in `app-map.md`.
- **Update and delete do not exist.** The model is create-and-append: drift creates a *linked* new
  record and marks the old one `superseded`. Cascade-delete and concurrent-edit scenarios were
  adapted accordingly (`DA-02`, `DA-05`) rather than reported as missing.

---

## Final test run

Both suites, full, after all twelve fixes.

### `pytest`

```
$ .venv/Scripts/python.exe -m pytest -q
.....................................                                    [100%]
37 passed in 2.43s
```

### `npx playwright test`

```
Running 63 tests using 1 worker

  ok  1 e2e\a11y.spec.ts:17:3 › Accessibility › every interactive element has an accessible name and every image has alt text (3.1s)
  ok  2 e2e\a11y.spec.ts:50:3 › Accessibility › all text meets WCAG AA contrast (2.7s)
  ok  3 e2e\a11y.spec.ts:66:3 › Accessibility › heading levels never skip (2.6s)
  ok  4 e2e\a11y.spec.ts:84:3 › Accessibility › the command center is fully operable by keyboard with visible focus (613ms)
  ok  5 e2e\a11y.spec.ts:123:3 › Accessibility › the evidence panel can be dismissed by keyboard and by button (644ms)
  ok  6 e2e\api-contract.spec.ts:6:3 › API contract › unknown /api path returns a JSON 404, not the SPA (28ms)
  ok  7 e2e\api-contract.spec.ts:13:3 › API contract › unknown nested /api path returns a JSON 404 (21ms)
  ok  8 e2e\api-contract.spec.ts:19:3 › API contract › wrong method on a real API path returns 405, not the SPA (41ms)
  ok  9 e2e\api-contract.spec.ts:25:3 › API contract › unknown non-API path still serves the SPA for client-side routing (26ms)
  ok 10 e2e\api-contract.spec.ts:33:3 › API contract › missing records return 404 with an unquoted detail sentence (91ms)
  ok 11 e2e\api-contract.spec.ts:51:3 › API contract › evaluate rejects empty, whitespace, missing and mistyped input (69ms)
  ok 12 e2e\api-contract.spec.ts:75:3 › API contract › path traversal in a decision id reads no files (46ms)
  ok 13 e2e\api-contract.spec.ts:86:3 › API contract › no endpoint leaks secrets, tracebacks or absolute source paths (170ms)
  ok 14 e2e\api-contract.spec.ts:109:3 › API contract › documented endpoints answer unauthenticated (recorded by design) (81ms)
  ok 15 e2e\api-contract.spec.ts:119:3 › API contract › concurrent watches on one decision both succeed and leave the store readable (67ms)
  ok 16 e2e\command-center.spec.ts:4:3 › Decision Command Center › lists seeded decisions with recommendations and scores (427ms)
  ok 17 e2e\command-center.spec.ts:28:3 › Decision Command Center › evaluate surfaces an error when Gemini key is missing (534ms)
  ok 18 e2e\command-center.spec.ts:39:3 › Decision Command Center › watch reports no drift for seeded decisions (624ms)
  ok 19 e2e\console-clean.spec.ts:6:3 › Console cleanliness › no console errors or warnings on any route (4.3s)
  ok 20 e2e\console-clean.spec.ts:30:3 › Console cleanliness › interacting with the graph and the watch action logs nothing (612ms)
  ok 21 e2e\drift-loop.spec.ts:61:1 › evaluate then watch creates a linked drift revision in the UI (525ms)
  ok 22 e2e\empty-states.spec.ts:6:3 › Empty states › an empty decision list explains itself (279ms)
  ok 23 e2e\empty-states.spec.ts:16:3 › Empty states › an evidence graph with no nodes shows an explanatory message (309ms)
  ok 24 e2e\empty-states.spec.ts:33:3 › Empty states › a decision with evidence still renders the graph, not the empty state (363ms)
  ok 25 e2e\error-states.spec.ts:6:3 › Error handling and resilience › a backend 500 shows a user-facing error and never leaks the stack trace (309ms)
  ok 26 e2e\error-states.spec.ts:30:3 › Error handling and resilience › a network failure shows a human message, not a raw JS error (266ms)
  ok 27 e2e\error-states.spec.ts:44:3 › Error handling and resilience › a 404 deep link renders a real page with a heading and a way back (586ms)
  ok 28 e2e\error-states.spec.ts:62:3 › Error handling and resilience › the 404 message is human, with no JS error prefix (267ms)
  ok 29 e2e\error-states.spec.ts:70:3 › Error handling and resilience › every data-backed route shows a loading state that resolves (5.9s)
  ok 30 e2e\error-states.spec.ts:91:3 › Error handling and resilience › a slow connection resolves the command center without a blank screen (2.1s)
  ok 31 e2e\evidence-graph.spec.ts:5:3 › Evidence Graph › renders nodes and reveals provenance when a node is clicked (332ms)
  ok 32 e2e\evidence-graph.spec.ts:40:3 › Evidence Graph › event node exposes its publication date and excerpt (322ms)
  ok 33 e2e\in-flight.spec.ts:5:3 › In-flight action state › every Watch button disables while any watch is in flight (3.2s)
  ok 34 e2e\in-flight.spec.ts:33:3 › In-flight action state › triple-clicking Evaluate fires exactly one request (2.2s)
  ok 35 e2e\in-flight.spec.ts:55:3 › In-flight action state › the Evaluate button disables and relabels while researching (2.3s)
  ok 36 e2e\input-validation.spec.ts:6:3 › Input handling › submitting an empty field fires no request (822ms)
  ok 37 e2e\input-validation.spec.ts:25:3 › Input handling › a 10,000-character IP is handled without breaking the layout (465ms)
  ok 38 e2e\input-validation.spec.ts:39:3 › Input handling › leading and trailing whitespace is trimmed before the request (407ms)
  ok 39 e2e\input-validation.spec.ts:56:3 › Input handling › unicode, emoji and RTL input reach the API intact (592ms)
  ok 40 e2e\input-validation.spec.ts:73:3 › Input handling › the field is cleared only on success, so a failed submit keeps the input (402ms)
  ok 41 e2e\navigation.spec.ts:6:3 › Cross-page state and navigation › a decision carries the same score across all four views (801ms)
  ok 42 e2e\navigation.spec.ts:31:3 › Cross-page state and navigation › back, forward, refresh and deep-link all land correctly mid-workflow (802ms)
  ok 43 e2e\navigation.spec.ts:63:3 › Cross-page state and navigation › the brand link always returns to the command center (780ms)
  ok 44 e2e\performance.spec.ts:6:3 › Performance sanity › every route reaches DOMContentLoaded quickly (2.6s)
  ok 45 e2e\performance.spec.ts:27:3 › Performance sanity › 1,000 decision cards render without stalling the page (1.7s)
  ok 46 e2e\performance.spec.ts:50:3 › Performance sanity › a 400-node evidence graph renders (436ms)
  ok 47 e2e\performance.spec.ts:73:3 › Performance sanity › no unbounded polling while idle (6.8s)
  ok 48 e2e\performance.spec.ts:87:3 › Performance sanity › no route issues the same API request twice (2.5s)
  ok 49 e2e\responsive.spec.ts:7:5 › Responsive layout › no horizontal page scroll at 1920x1080 (2.7s)
  ok 50 e2e\responsive.spec.ts:7:5 › Responsive layout › no horizontal page scroll at 1366x768 (2.5s)
  ok 51 e2e\responsive.spec.ts:7:5 › Responsive layout › no horizontal page scroll at 768x1024 (2.7s)
  ok 52 e2e\responsive.spec.ts:7:5 › Responsive layout › no horizontal page scroll at 375x667 (2.6s)
  ok 53 e2e\responsive.spec.ts:32:3 › Responsive layout › a wide evidence graph scrolls inside its container, not the page (457ms)
  ok 54 e2e\responsive.spec.ts:63:3 › Responsive layout › the graph container never exceeds its available width at 375px (443ms)
  ok 55 e2e\stress-test.spec.ts:5:3 › Counterfactual Stress Test › shows the minimum detected flip to PASS (346ms)
  ok 56 e2e\stress-test.spec.ts:24:3 › Counterfactual Stress Test › sensitivity table lists per-component score impact (348ms)
  ok 57 e2e\stress-test.spec.ts:41:3 › Counterfactual Stress Test › a PASS decision reports no reachable flip rather than a false one (360ms)
  ok 58 e2e\stress-test.spec.ts:60:3 › Counterfactual headline correctness › the headline flip is the smallest one, not merely the first listed (386ms)
  ok 59 e2e\stress-test.spec.ts:108:3 › Counterfactual headline correctness › scenarios are listed smallest swing first (402ms)
  ok 60 e2e\timeline.spec.ts:5:3 › Decision Drift Timeline › shows the full PURSUE -> WATCH -> PASS chain with new-evidence markers (496ms)
  ok 61 e2e\untrusted-content.spec.ts:15:3 › Untrusted evidence content › markup, injection strings, unicode and RTL render literally (518ms)
  ok 62 e2e\untrusted-content.spec.ts:58:3 › Untrusted evidence content › a javascript: source URL is never rendered as a live link (1.2s)
  ok 63 e2e\untrusted-content.spec.ts:94:3 › Untrusted evidence content › http and https source URLs stay clickable (491ms)

  63 passed (1.3m)
```

**100 tests, 0 failures.** Coverage grew from 44 tests (34 pytest + 10 Playwright) to 100
(37 pytest + 63 Playwright).
