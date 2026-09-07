# BLACKBOOK — Application Map

Written during Phase 1 recon (no code changes). Everything below was verified against a
running instance (`BLACKBOOK_SEED_DEMO=1`, no API keys) rather than read from the README alone.

## Project context

| Field | Value |
|---|---|
| App name | BLACKBOOK — decision intelligence for film & TV IP |
| Repo path | `D:\Projects\Learn-Packages\google` |
| Tech stack | Python 3.13 · FastAPI · Pydantic v2 · SQLite · React 18 + Vite 5 + react-router 6 (TypeScript) · Playwright |
| Start the app | `uvicorn app.api:app` (serves API **and** the built SPA from `web/dist`) · dev UI: `cd web && npm run dev` |
| App URL | `http://localhost:8000` (prod bundle) · `http://localhost:5173` (Vite dev) · `127.0.0.1:8777` (e2e) |
| Test credentials | **None — the app has no authentication of any kind.** See "Auth" below. |
| Seed / demo data | `BLACKBOOK_SEED_DEMO=1` env var (seeds on startup if the store is empty), or `python scripts/seed_demo.py` |
| Existing test suite | `pytest` (34 unit/integration) · `cd web && npx playwright test` (10 e2e) |
| Audience for the demo | Agentic Cinema hackathon judges (Devpost submission) |
| Target video length | ≤ 3:00 (`MAX_SECONDS = 180` is enforced by `web/scripts/make-video.js`) |

## Routes / pages

| Route | Purpose | Data source |
|---|---|---|
| `/` | **Decision Command Center.** Evaluate an IP; list every decision as a card with score gauge, PURSUE/WATCH/PASS, four component bars, and a `Watch` (drift check) action. | `GET /api/decisions`, `POST /api/evaluate`, `POST /api/watch` |
| `/decisions/:id` | **Evidence Graph.** Column-laid-out node/edge graph; clicking a node opens a provenance panel (source URL, title, published, observed, confidence, excerpt). | `GET /api/decisions/{id}` |
| `/decisions/:id/stress-test` | **Counterfactual.** Minimum changes that flip the recommendation + a per-component sensitivity table. | `GET /api/decisions/{id}`, `POST /api/counterfactual` |
| `/decisions/:id/timeline` | **Decision Drift.** The `previous_decision_id` lineage rendered as a timeline, with NEW EVIDENCE markers between revisions. | `GET /api/decisions/{id}/lineage` |
| `*` | Client-side redirect to `/` (`<Navigate to="/" replace />`). There is no 404 page. | — |

## Primary user workflows

1. **Evaluate an IP** — type an IP on `/` → `POST /api/evaluate {ip, create_monitor:true}` → Gemini plans queries → Parallel Search/Extract/Task → Gemini builds an `EvidenceGraph` → Gemini returns four component scores → **the score and recommendation are computed in `agent/scoring.py`, not by the model** → persisted → card appears.
2. **Inspect the evidence** — card → `Evidence` → click any node → provenance panel.
3. **Stress-test a decision** — card → `Stress Test` → deterministic flip scenarios + sensitivity.
4. **Drift check** — card → `Watch` → `POST /api/watch` → fetch Parallel Monitor events → dedupe by fingerprint → Gemini materiality check → if material, a linked revision is created and the old record is marked `superseded`.
5. **Read the decision history** — card → `Timeline` → the full lineage chain.

## API surface

Base path `/api`. **No endpoint requires authentication or any header.**

| Method | Path | Success | Error shapes |
|---|---|---|---|
| GET | `/api/health` | `200 {"status":"ok"}` | — |
| GET | `/health` | `200 {"status":"ok"}` (unprefixed container probe) | — |
| POST | `/api/evaluate` | `200 DecisionRecord` | `422` pydantic validation · `400 {"detail":"ip must not be empty"}` · `404` KeyError · `502` any other exception (incl. missing `GOOGLE_API_KEY`) |
| GET | `/api/decisions` | `200 DecisionRecord[]` (newest first, unpaginated) | — |
| GET | `/api/decisions/{id}` | `200 DecisionRecord` | `404 {"detail":"decision not found"}` |
| GET | `/api/decisions/{id}/lineage` | `200 DecisionRecord[]` (oldest → newest) | `404 {"detail":"decision not found"}` |
| POST | `/api/watch` | `200 WatchResult` | `404` · `502` |
| POST | `/api/counterfactual` | `200 CounterfactualAnalysis` | `404` · `502` |
| GET | `/{full_path:path}` | `200 text/html` — SPA fallback | `404` only when `web/dist/index.html` is missing |

`/docs` and `/openapi.json` are served publicly (FastAPI defaults). For a hackathon demo this is
intentional and is treated as a feature, not a finding.

## Authentication & authorization — **not present**

There is no login, no session, no cookie, no token, no user table, and no tenancy. Every decision
is readable and mutable by anyone who can reach the port. Consequently the entire Phase 2.3
category (login states, session expiry, role A vs role B, IDOR, logout invalidation) **has no
subject in this codebase**. It is recorded here as an explicit scope exclusion rather than
silently skipped — see `test-plan.md` §2.3. The single security-relevant control surface that does
exist is *untrusted content rendering*: evidence fields are LLM-extracted from third-party web
pages, so they are treated as attacker-influenced input and tested as such.

## Persistent state

| Store | What | Reset |
|---|---|---|
| SQLite `decisions` table | `decision_id, ip, recommendation, score, payload(JSON), status, previous_decision_id, created_at`. The full `DecisionRecord` (including the whole evidence graph) is stored as JSON in `payload`; `status` is authoritative in its own column and overrides the payload on hydration. | Delete the DB file. Path from `BLACKBOOK_DB` (default `blackbook.db`). |
| Browser | **Nothing.** No localStorage, sessionStorage, cookies, or service worker. All UI state is in-memory React state. | Reload. |
| Parallel Monitor | `monitor_id` on a record points at a remote persistent monitor. | Not resettable locally; seeded records have `monitor_id = null`. |

A single shared `sqlite3` connection (`check_same_thread=False`) serialised behind a
`threading.Lock` backs the store, because FastAPI runs sync endpoints on a threadpool.

## External dependencies and how they are stubbed

| Dependency | Used for | Deterministic stub |
|---|---|---|
| Google Gemini (`google-genai`) | research plan, evidence graph, assessment, drift materiality | Unset `GOOGLE_API_KEY` → `evaluate_ip` raises before any network call. Unit tests inject a fake `GeminiClient`. E2E asserts the missing-key error path with `GOOGLE_API_KEY: ""` in `playwright.config.ts`. |
| Parallel Search / Extract / Task | web research | Wrapped in `agent/tools/`; `parallel_task` and `create_monitor` failures are caught and degrade `ResearchStatus`. |
| Parallel Monitor | drift events | Seeded records carry `monitor_id = null`, so `watch_decision` short-circuits to "no drift" with zero network. |
| Windows SAPI (`tts.ps1`) + ffmpeg | demo video narration & mux | Local only; not part of any test path. |

The e2e suite therefore runs fully offline: it boots its own uvicorn on `127.0.0.1:8777` against a
throwaway DB in the temp dir, seeds it, and blanks `GOOGLE_API_KEY` so the developer's `.env`
cannot change the outcome.

## Existing tests — coverage and gaps

**Covered (34 pytest):** schema validation and defaults; `DecisionStore` round-trip, status
override, lineage; deterministic score/recommendation incl. threshold boundaries; counterfactual
flip search and the rounding fix in `sensitivity`; pipeline guards (empty IP, missing key, event
fingerprinting/dedup, drift chaining).

**Covered (10 Playwright):** command-center listing, the missing-key error path, no-drift watch,
a fully mocked evaluate→watch drift loop, evidence node provenance, three counterfactual cases,
the PURSUE→WATCH→PASS timeline.

**Not covered before this pass — and where the bugs were actually found:**

- No test asserts the **API contract for unknown paths or wrong methods** → BUG-01.
- No test asserts the **shape of error `detail`** strings → BUG-02.
- Counterfactual tests only use seeded scores, where the first-listed flip happens to also be the
  smallest; **no test pins the "smallest change" claim** the UI makes → BUG-03.
- **Zero responsive/viewport tests** → BUG-04.
- **Zero empty-state tests** for the evidence graph → BUG-05.
- **Zero in-flight/disabled-state tests** beyond the clicked button → BUG-06.
- **Zero tests for how errors are worded** to the user → BUG-07, BUG-08.
- **Zero tests for untrusted evidence content** (URL schemes, markup, injection strings) → BUG-09.
- No accessibility assertions (contrast, heading order, focus, dismissal) → BUG-10, BUG-11, BUG-12.
- No console-error assertions on any page.

## Riskiest areas, ranked

1. **The counterfactual headline claim.** The entire pitch is "the system decides, deterministically,
   and we show our work." A headline that says *"the smallest plausible change"* while displaying
   something that is not the smallest is the one class of bug that directly contradicts the demo
   narration. Untested, and it is wrong (BUG-03).
2. **Rendering LLM-extracted third-party content.** `source_url`, `source_title`, `label` and `quote`
   all originate from scraped web pages and go straight into the DOM. React escapes text, but
   `href` takes whatever scheme it is given (BUG-09).
3. **The catch-all SPA route.** `@app.get("/{full_path:path}")` swallows every unmatched path
   including `/api/*`, turning API typos into `200 text/html` (BUG-01). This is the kind of thing
   that makes a live demo fail confusingly.
4. **Viewport fragility of the evidence graph.** Its width is computed from node count and applied
   inline, so the graph — the visual centrepiece of the demo — can push the whole page sideways
   (BUG-04).
5. **Error-path presentation.** Every failure surfaces as `String(err)`, so users see
   `TypeError: Failed to fetch` (BUG-07) and a bad deep link yields a page with no heading and no
   way back (BUG-08).
6. **Unbounded list rendering.** `/api/decisions` returns every row and the UI renders every card:
   no pagination, sorting, filtering, or search exists anywhere in the product. 1,000 cards render
   in ~1.6 s, so it is not a defect today, but it is the first thing that breaks at real scale.
   Recorded as a **scope gap, not a bug** — building pagination is a feature, not a fix.
7. **Single shared SQLite connection.** Correct today (serialised by a lock, and concurrent
   `POST /api/watch` from two tabs both returned 200), but it is a single writer with no busy
   timeout and would be the first bottleneck under real concurrency.
