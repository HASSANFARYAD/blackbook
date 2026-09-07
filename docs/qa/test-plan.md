# BLACKBOOK — Test Plan

Scope: the FastAPI service and the React SPA it serves, exercised end to end against a seeded,
offline instance. Priorities: **P0** demo-critical / correctness of a claim the product makes ·
**P1** important behaviour a judge or user will hit · **P2** polish.

Automated coverage lives in `web/e2e/` (Playwright) and `tests/` (pytest). Every P0 and P1
scenario below is automated; the spec file is named in the last column. Scenarios marked
*manual* are one-off recon checks that produced no defect and are not worth a permanent test.

---

## 2.1 Happy path

| ID | Title | Preconditions | Steps | Expected | Pri | Automated in |
|---|---|---|---|---|---|---|
| HP-01 | Command center lists every seeded decision | Seeded DB | Load `/` | 5 cards; PURSUE, WATCH and PASS all present; each card shows a score and four component values | P0 | `command-center.spec.ts` |
| HP-02 | Evidence graph renders nodes and provenance | Seeded DB | `/decisions/{expanse-PASS}` → click "Acme Studios" | 5 nodes; panel shows entity, source link, published, observed, confidence, excerpt | P0 | `evidence-graph.spec.ts` |
| HP-03 | Counterfactual shows a reachable flip | Seeded DB | `/decisions/{seveneves}/stress-test` | Flip banner; at least one PASS scenario; sensitivity table populated | P0 | `stress-test.spec.ts` |
| HP-04 | Drift timeline shows the full lineage | Seeded DB | `/decisions/{expanse-PASS}/timeline` | 3 revisions PASS→WATCH→PURSUE, 2 NEW EVIDENCE markers, newest tagged CURRENT | P0 | `timeline.spec.ts` |
| HP-05 | Evaluate → watch creates a linked revision | API mocked | Evaluate a new IP, then Watch it | Notice reports PURSUE, then "Drift detected"; a WATCH revision card appears | P0 | `drift-loop.spec.ts` |
| HP-06 | Cross-page state: a decision seen on `/` opens correctly on all three detail pages | Seeded DB | `/` → Evidence → Stress Test → Timeline via in-page links | Same IP and score on every page; no refetch errors | P1 | `navigation.spec.ts` |
| HP-07 | Refresh, back button and deep-link mid-workflow | Seeded DB | Navigate `/` → evidence → stress-test, press Back, reload, press Back again | Each step lands on the right route with fully rendered data; SPA fallback serves deep links | P1 | `navigation.spec.ts` |
| HP-08 | Single-revision decision renders a one-step timeline | Seeded DB | `/decisions/{dune}/timeline` | 1 card, 0 NEW EVIDENCE markers, tagged CURRENT | P2 | *manual — passed* |

## 2.2 Input & validation

| ID | Title | Preconditions | Steps | Expected | Pri | Automated in |
|---|---|---|---|---|---|---|
| IV-01 | Empty and whitespace-only IP rejected | Server up | `POST /api/evaluate {"ip":""}` and `{"ip":"   "}` | `400 {"detail":"ip must not be empty"}` for both | P1 | `api-contract.spec.ts` |
| IV-02 | Missing field / wrong type | Server up | `POST /api/evaluate {}` and `{"ip":123}` | `422` with a pydantic `detail` array naming `body.ip` | P1 | `api-contract.spec.ts` |
| IV-03 | Malformed JSON body | Server up | `POST /api/evaluate` with `{bad` | `422 json_invalid`, no stack trace | P1 | `api-contract.spec.ts` |
| IV-04 | Submit button is inert for blank input | Seeded DB | Click Evaluate with an empty field | No request fires, no error banner | P1 | `api-contract.spec.ts` |
| IV-05 | 10,000-character IP does not break the layout | Seeded DB | Paste 10k chars, submit | Error surfaces normally; no horizontal page scroll | P1 | `input-validation.spec.ts` |
| IV-06 | Unicode / emoji / RTL / newlines survive a round trip | Seeded DB | Render an evidence quote containing `مرحبا 🎬` and newlines | Text renders literally, no mojibake, no layout break | P1 | `untrusted-content.spec.ts` |
| IV-07 | Script tag in evidence text is neutralised, not executed | Seeded DB | Serve a node whose `label` is `<script>…</script>` | Rendered as literal text; no script executes | P0 | `untrusted-content.spec.ts` |
| IV-08 | SQL-injection, template-expression and path-traversal strings are inert | Seeded DB | Serve a quote containing `'; DROP TABLE decisions;--`, `{{7*7}}`, `../../etc/passwd` | All render literally; `{{7*7}}` does **not** become `49`; DB intact afterwards | P0 | `untrusted-content.spec.ts` |
| IV-09 | `javascript:` scheme never reaches an `href` | Seeded DB | Serve a node with `source_url: "javascript:…"` | The link is rendered inert (not a live `javascript:` href) | P1 | `untrusted-content.spec.ts` |
| IV-10 | Path-traversal in a decision id is not a file read | Server up | `GET /api/decisions/..%2F..%2Fetc%2Fpasswd` | No file contents in the response | P0 | `api-contract.spec.ts` |
| IV-11 | Double / triple-click submit fires one request | Seeded DB | Click Evaluate three times rapidly with a slow route | Exactly one `POST /api/evaluate` | P1 | `input-validation.spec.ts` |
| IV-12 | Leading/trailing spaces are trimmed before submit | Seeded DB | Submit `"  The Expanse  "` | Request body carries the trimmed value | P2 | `input-validation.spec.ts` |
| IV-13 | Score boundary values | — | `recommend()` at 79/80, 54/55, rights 59/60 | Thresholds are inclusive as documented | P0 | `tests/test_scoring.py` (existing) |
| IV-14 | Component clamping at 0 and 100 | — | `with_adjusted` beyond both bounds | Clamped, never out of range | P1 | `tests/test_counterfactual.py` (existing) |

## 2.3 Authentication & authorization — **not applicable**

BLACKBOOK has no authentication, no session, no user model and no roles (see `app-map.md`).
Login, session expiry, role-boundary, IDOR and logout scenarios have no subject here and are
**excluded, not skipped** — writing them would mean inventing an auth layer that does not exist.

What *is* tested instead, because it is the real trust boundary in this app:

| ID | Title | Expected | Pri | Automated in |
|---|---|---|---|---|
| AZ-01 | Every endpoint is reachable unauthenticated **by design** — record it so a future auth regression is visible | All documented endpoints return their normal success shape with no credentials | P2 | `api-contract.spec.ts` |
| AZ-02 | Untrusted third-party evidence cannot execute in the app origin | See IV-07 … IV-09 | P0 | `untrusted-content.spec.ts` |

## 2.4 Data & CRUD integrity

The product is create-and-append only: there is no update or delete in the UI or the API.
`DecisionStore.save` upserts, and drift creates a *new linked record* rather than mutating the old
one. So classic CRUD/cascade/concurrent-edit scenarios are partially inapplicable; what applies:

| ID | Title | Preconditions | Steps | Expected | Pri | Automated in |
|---|---|---|---|---|---|---|
| DA-01 | Create → read → persists across a full reload | Seeded DB | Read a decision, hard-reload the page | Identical score, recommendation and node count | P1 | `navigation.spec.ts` |
| DA-02 | Drift supersedes rather than corrupts | — | Run a drift re-evaluation | Old record `status="superseded"`, new record links back via `previous_decision_id`; the old record's own payload is unchanged | P0 | `tests/test_pipeline.py` (existing) |
| DA-03 | Lineage of a record whose ancestor is missing | — | Break the chain | Traversal stops cleanly, no crash, no infinite loop | P1 | `tests/test_store.py` (existing) |
| DA-04 | Lineage cycle protection | — | `previous_decision_id` pointing at itself | `seen` set terminates the walk | P1 | `tests/test_store.py` (existing) |
| DA-05 | Concurrent `POST /api/watch` from two tabs | Seeded DB | Fire both simultaneously | Both return 200; no DB corruption; store still readable | P1 | `api-contract.spec.ts` |
| DA-06 | Duplicate monitor events never produce a duplicate revision | — | Re-watch with the same event ids | `consumed_event_ids` dedupe short-circuits | P0 | `tests/test_pipeline.py` (existing) |
| DA-07 | Pagination / sorting / filtering / search | — | — | **No such feature exists.** Recorded as a scope gap in `app-map.md`, not tested. | — | n/a |

## 2.5 Error handling & resilience

| ID | Title | Preconditions | Steps | Expected | Pri | Automated in |
|---|---|---|---|---|---|---|
| ER-01 | Unknown `/api/*` path returns a JSON 404 | Server up | `GET /api/nope` | `404` `application/json`, **not** `200 text/html` | P0 | `api-contract.spec.ts` |
| ER-02 | Wrong method on a real API path | Server up | `GET /api/evaluate` | `405` JSON, not the SPA | P0 | `api-contract.spec.ts` |
| ER-03 | Unknown *non*-API path still serves the SPA | Server up | `GET /totally/unknown` | `200 text/html` (client-side routing) | P0 | `api-contract.spec.ts` |
| ER-04 | Missing record returns a clean 404 with a consistent detail string | Server up | `GET /api/decisions/nope`, `POST /api/watch`, `POST /api/counterfactual` | All `404`; `detail` is a plain sentence with no Python `repr` quoting | P1 | `api-contract.spec.ts` |
| ER-05 | Backend 500 → user-facing message, no stack trace | Seeded DB | Mock `/api/decisions` → 500 with a traceback body | An error is shown; the traceback text never reaches the DOM; page is not blank | P0 | `error-states.spec.ts` |
| ER-06 | Network failure → a human error, not `TypeError: Failed to fetch` | Seeded DB | Abort `/api/decisions` | Message is user-readable and mentions no JS type | P1 | `error-states.spec.ts` |
| ER-07 | 404 deep-link renders a real page with a heading and a way back | Seeded DB | Load `/decisions/nope`, `…/stress-test`, `…/timeline` | Each shows a heading and a link back to the command center | P1 | `error-states.spec.ts` |
| ER-08 | Slow network shows a loading state that resolves | Seeded DB | Throttle to 3G, load every route | "Loading…" appears and is replaced by content | P1 | `error-states.spec.ts` |
| ER-09 | No secrets, tokens, stack traces or internal paths in any response | Server up | Sweep every endpoint's body and headers | No `GOOGLE_API_KEY`/`PARALLEL_API_KEY` value, no `Traceback`, no absolute source path | P0 | `api-contract.spec.ts` |
| ER-10 | Missing `GOOGLE_API_KEY` produces an actionable message, not a crash | No key | `POST /api/evaluate` | Error names the variable and the remedy | P0 | `command-center.spec.ts` (existing) |

## 2.6 UI/UX & accessibility

| ID | Title | Preconditions | Steps | Expected | Pri | Automated in |
|---|---|---|---|---|---|---|
| UX-01 | Zero console errors/warnings on every route | Seeded DB | Visit all four routes, capture console | No `error` or `warning` entries | P0 | `console-clean.spec.ts` |
| UX-02 | No horizontal page scroll at 1920×1080, 1366×768, 768×1024, 375×667 | Seeded DB | Every route at every size | `scrollWidth <= clientWidth` on `<html>` | P0 | `responsive.spec.ts` |
| UX-03 | Wide evidence graph scrolls inside its own container | Seeded DB | 400-node graph at 1440px | The graph pans internally; the document does not scroll sideways | P0 | `responsive.spec.ts` |
| UX-04 | Keyboard-only traversal of each core workflow | Seeded DB | Tab through `/`, activate a card link with Enter | Logical order, every stop has a visible focus indicator, navigation works without a mouse | P1 | `a11y.spec.ts` |
| UX-05 | Every interactive element has an accessible name; images have alt text | Seeded DB | Audit all routes | No unnamed `a/button/input`; no `img` without `alt` | P1 | `a11y.spec.ts` |
| UX-06 | Text contrast meets WCAG AA (alpha-composited) | Seeded DB | Compute the real ratio for every text node on every route | Every ratio ≥ 4.5:1 (≥ 3:1 for large text) | P1 | `a11y.spec.ts` |
| UX-07 | Heading order does not skip a level | Seeded DB | Audit all routes | `h1 → h2 → h3` with no jumps | P2 | `a11y.spec.ts` |
| UX-08 | Empty states exist for every list/graph | Seeded DB | Serve a decision with zero evidence nodes; serve an empty decision list | Both show an explanatory message, not a blank box | P0 | `empty-states.spec.ts` |
| UX-09 | Buttons disable while their action is in flight | Seeded DB | Start a slow Watch | **Every** Watch button disables, not just the clicked one | P1 | `in-flight.spec.ts` |
| UX-10 | The evidence panel can be dismissed | Seeded DB | Open a node panel, press Escape / click Close | Panel closes | P2 | `a11y.spec.ts` |
| UX-11 | Loading states exist on every data-backed route | Seeded DB | Delay every API call | Each route shows "Loading…" before content | P1 | `error-states.spec.ts` |

## 2.7 Performance sanity

| ID | Title | Preconditions | Steps | Expected | Pri | Automated in |
|---|---|---|---|---|---|---|
| PF-01 | Initial load and time-to-interactive per route | Seeded DB | Measure `domContentLoaded` on all four routes | < 1 s locally on every route | P1 | `performance.spec.ts` |
| PF-02 | 1,000-row list stays responsive | Mocked list | Render 1,000 decision cards | All render, under 8 s, page interactive | P1 | `performance.spec.ts` |
| PF-03 | 400-node evidence graph renders | Mocked record | Load the graph | Renders under 8 s and stays inside its scroll container | P1 | `performance.spec.ts` |
| PF-04 | No unbounded polling | Seeded DB | Sit idle on `/` for 8 s | Zero further `/api/*` requests | P0 | `performance.spec.ts` |
| PF-05 | No duplicated network requests per route | Seeded DB | Count `/api/*` calls per navigation | No identical request issued twice | P1 | `performance.spec.ts` |

---

## Test data

All UI scenarios run against `app/demo_seed.py`, which builds five records with the **real**
scoring engine:

| IP | Score | Rec | Why it is in the fixture |
|---|---|---|---|
| The Expanse (v1) | 81 | PURSUE | head of the drift chain, `superseded` |
| The Expanse (v2) | 76 | WATCH | mid-chain, `superseded` |
| The Expanse (v3) | 50 | PASS | the "no reachable flip" floor case |
| Dune: Messiah | 86 | PURSUE | clean PURSUE, flips only to WATCH |
| Seveneves | 62 | WATCH | reachable PASS flip |

Scenarios needing data the fixture cannot express (empty graphs, 1,000 rows, poisoned evidence,
500s, aborts) use Playwright route interception so they stay deterministic and offline.
