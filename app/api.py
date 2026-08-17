"""FastAPI service exposing BLACKBOOK over HTTP, serving the built web UI."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent.pipeline import Blackbook
from agent.schemas import CounterfactualAnalysis, DecisionRecord, WatchResult
from agent.store import DecisionStore

# Load .env before anything reads GOOGLE_API_KEY / PARALLEL_API_KEY, so the
# README's `cp .env.example .env` flow works for the server too, not just the CLI.
load_dotenv()


def _web_dir() -> Path:
    return Path(__file__).resolve().parent.parent / os.getenv("BLACKBOOK_WEB_DIR", "web/dist")


_blackbook = Blackbook(
    store=DecisionStore(os.getenv("BLACKBOOK_DB", "blackbook.db"))
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Demo mode: seed a realistic dataset so the UI has data without API keys.
    if os.getenv("BLACKBOOK_SEED_DEMO", "0") == "1" and not _blackbook.store.list():
        from app.demo_seed import seed

        seed(_blackbook.store)
    yield


app = FastAPI(
    title="BLACKBOOK",
    description="AI IP deal intelligence agent: evidence-backed development intelligence for studios.",
    version="0.1.0",
    lifespan=lifespan,
)

_assets = _web_dir() / "assets"
if _assets.is_dir():
    app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")


class EvaluateRequest(BaseModel):
    ip: str
    create_monitor: bool = False


class WatchRequest(BaseModel):
    decision_id: str


class CounterfactualRequest(BaseModel):
    decision_id: str


api = APIRouter(prefix="/api")


@api.get("/health")
def health() -> dict:
    return {"status": "ok"}


@api.post("/evaluate", response_model=DecisionRecord)
def evaluate(req: EvaluateRequest) -> DecisionRecord:
    try:
        return _blackbook.evaluate_ip(req.ip, create_monitor=req.create_monitor)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@api.get("/decisions", response_model=list[DecisionRecord])
def list_decisions() -> list[DecisionRecord]:
    return _blackbook.store.list()


@api.get("/decisions/{decision_id}", response_model=DecisionRecord)
def get_decision(decision_id: str) -> DecisionRecord:
    record = _blackbook.store.get(decision_id)
    if record is None:
        raise HTTPException(status_code=404, detail="decision not found")
    return record


@api.get("/decisions/{decision_id}/lineage", response_model=list[DecisionRecord])
def decision_lineage(decision_id: str) -> list[DecisionRecord]:
    lineage = _blackbook.lineage(decision_id)
    if not lineage:
        raise HTTPException(status_code=404, detail="decision not found")
    return lineage


@api.post("/watch", response_model=WatchResult)
def watch(req: WatchRequest) -> WatchResult:
    try:
        return _blackbook.watch_decision(req.decision_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@api.post("/counterfactual", response_model=CounterfactualAnalysis)
def counterfactual(req: CounterfactualRequest) -> CounterfactualAnalysis:
    try:
        return _blackbook.counterfactual(req.decision_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


app.include_router(api)


@app.get("/health", include_in_schema=False)
def infra_health() -> dict:
    """Unprefixed health probe for Cloud Run / container checks."""
    return {"status": "ok"}


@app.get("/{full_path:path}", include_in_schema=False)
def spa_fallback(full_path: str) -> FileResponse:
    """Serve the built SPA for any non-API route (client-side routing)."""
    index = _web_dir() / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=404,
            detail="Web UI not built. Run `npm run build` in web/ first.",
        )
    return FileResponse(index)
