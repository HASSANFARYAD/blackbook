# BLACKBOOK

**Decision intelligence for film & TV IP.**

Research an IP. Make a decision. Remember why. Detect when the decision should change.

> BLACKBOOK researches an IP, builds an **evidence graph**, produces a **PURSUE / WATCH / PASS** recommendation with a score, **remembers the evidence behind the decision**, then maintains a **persistent Parallel Monitor** and evaluates new events for **decision drift**, creating linked decision revisions when material changes are detected.

Built for the Agentic Cinema hackathon, Parallel track: **Google Gemini (genai + ADK)** for orchestration and structured assessment, **Parallel** (Search, Extract, Task, Monitor) for the research loop.

---

## What makes it different

Not a search engine, not a "tell me about this movie" chat.

1. **Evidence Graph** - every claim is a node/edge with `source -> timestamp -> confidence -> relationship`. No blob-of-text outputs.
2. **Deterministic Decision Engine** - Gemini scores four components (opportunity, competition, rights confidence, production feasibility). **Your code computes the score and recommendation from fixed weights and thresholds - Gemini explains, the system decides.** Identical inputs always produce identical outputs.
3. **Decision Memory** - every decision, its evidence, and its reasoning is persisted (SQLite), with explicit lineage (`previous_decision_id`) forming a decision timeline.
4. **Decision Drift** - a persistent Parallel Monitor tracks the web; detected events carry provenance (URL, title, published date), are deduplicated so the same event never produces a repeated revision, and are checked for materiality, triggering a linked re-evaluation chained back to the original via `previous_decision_id`. Drift evaluation is on-demand today (`POST /watch`); webhook-driven automatic re-evaluation is the next step.
5. **Counterfactual Decision Simulator** - ask *"what would have to change for you to recommend PASS?"* and get a real answer: the simulator runs scenarios through the **same deterministic scoring function** to find the smallest changes that flip the recommendation.

```
"Evaluate this IP"
        |
        v
  Research loop          Parallel Search -> Extract -> Task (health tracked per stage)
        |
        v
  Evidence Graph         source + timestamp + confidence + relationship
        |
        v
  Gemini Assessment      4 component scores + reasoning (no final score)
        |
        v
  Deterministic scoring  weighted total -> PURSUE / WATCH / PASS
        |
        v
  Decision Memory        persisted with its evidence + lineage
        |
        v
  Parallel Monitor       persistent watch for new events
        |
        v
  Drift check            material? -> re-assess -> deterministic score -> linked decision
```

## Deterministic scoring

Gemini returns `Assessment` (four component scores + reasoning). The score and recommendation are computed in `agent/scoring.py`:

```python
score = round(
    opportunity        * 0.30
    + rights_confidence* 0.30
    + (100 - competition) * 0.20     # competition is inverted
    + production_feasibility * 0.20
)

PURSUE  if score >= 80 and rights_confidence >= 60
WATCH   if score >= 55
PASS    otherwise
```

The counterfactual simulator (`agent/counterfactual.py`) reuses exactly these functions, so its projected scores are guaranteed to be the numbers the real engine would produce.

## Project layout

```
agent/
  pipeline.py        orchestration: research -> graph -> assessment -> decision -> drift
  scoring.py         deterministic score + recommendation + delta simulation
  counterfactual.py  deterministic decision-flip simulator
  schemas.py         EvidenceGraph, Assessment, Decision, Drift, Counterfactual models
  llm.py             Gemini client (text + native JSON schema outputs)
  prompts.py         prompt templates for each stage
  store.py           SQLite decision memory
  tools/             Parallel Search / Extract / Task / Monitor wrappers
  agent.py           ADK agent exposing the loop as Gemini tools (optional extra)
app/
  api.py             FastAPI service (API + serves the built web UI)
web/                 React + Vite SPA (command center, evidence graph, stress test, timeline)
tests/               unit + integration tests (no network, no API keys required)
scripts/demo.py      CLI walkthrough
```

## Quickstart

```bash
pip install -e ".[dev]"

cp .env.example .env
# set GOOGLE_API_KEY (https://aistudio.google.com/apikey)
# set PARALLEL_API_KEY (https://platform.parallel.ai)

# CLI demo
python scripts/demo.py "The Expanse" --watch --counterfactual

# API
uvicorn app.api:app --reload
# GET  /api/health
# POST /api/evaluate  {"ip": "The Expanse", "create_monitor": true}
# GET  /api/decisions
# GET  /api/decisions/{id}
# GET  /api/decisions/{id}/lineage
# POST /api/watch      {"decision_id": "..."}
# POST /api/counterfactual {"decision_id": "..."}
```

### Web UI

```bash
cd web
npm install

# dev (hot reload, proxies API to localhost:8000)
npm run dev            # http://localhost:5173

# production bundle served by FastAPI at the app root
npm run build          # -> web/dist, served at http://localhost:8000
```

The UI has four views:

- **`/`** Decision Command Center — evaluate an IP, see PURSUE / WATCH / PASS cards with component scores, and trigger a drift check (`Watch`).
- **`/decisions/:id`** Evidence Graph — every claim is a node/edge; clicking a node shows its source URL, title, publication date, observation date, confidence, and excerpt.
- **`/decisions/:id/stress-test`** Counterfactual — the minimum changes that would flip the recommendation, computed by the real scoring engine.
- **`/decisions/:id/timeline`** Decision Drift — the linked decision lineage: how new evidence moved the recommendation from PURSUE → WATCH → PASS.

### Interactive ADK agent (optional)

The interactive ADK agent adds a large Google Cloud dependency tree, so it is an optional extra:

```bash
pip install -e ".[agent]"
python -c "from agent.agent import run_query; print(run_query('Evaluate The Expanse'))"
```

## Deployment: local vs Google Cloud

| | Local dev | Hackathon deployment |
|---|---|---|
| Auth | `GOOGLE_API_KEY` (AI Studio) | Google Cloud ADC / workload identity |
| Client | `genai.Client(api_key=...)` | `genai.Client(vertexai=True, project=..., location=...)` |
| Env | `GOOGLE_API_KEY=...` | `GOOGLE_GENAI_USE_ENTERPRISE=true`, `GOOGLE_CLOUD_PROJECT=...`, `GOOGLE_CLOUD_LOCATION=global` |

The service defaults to API-key auth; setting `GOOGLE_GENAI_USE_ENTERPRISE=true` routes all Gemini calls through Vertex AI / Gemini Enterprise with `GOOGLE_CLOUD_PROJECT`. Deploy via `Dockerfile` (FastAPI on Cloud Run).

## Tests

```bash
pytest
```

All tests are offline - they exercise schemas, decision memory, deterministic scoring, counterfactual simulation, and pipeline guards without calling APIs.

## Note

This is development intelligence, not legal advice. The agent explicitly flags when rights require human/legal verification.
