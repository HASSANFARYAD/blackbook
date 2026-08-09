"""BLACKBOOK pipeline: research -> evidence graph -> decision -> drift -> re-evaluate."""

from __future__ import annotations

import hashlib
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime

from agent import counterfactual, prompts
from agent.llm import GeminiClient
from agent.schemas import (
    Assessment,
    CounterfactualAnalysis,
    DecisionRecord,
    DriftEvaluation,
    EvidenceGraph,
    EvidenceNode,
    EntityType,
    ResearchStatus,
    SearchPlan,
    WatchResult,
)
from agent.scoring import calculate_score, recommend
from agent.store import DecisionStore
from agent.tools.parallel_extract import parallel_extract
from agent.tools.parallel_monitor import create_monitor, fetch_monitor_events
from agent.tools.parallel_search import parallel_search
from agent.tools.parallel_task import parallel_task


def _max_queries() -> int:
    return int(os.getenv("BLACKBOOK_MAX_QUERIES", "3"))


def _max_urls() -> int:
    return int(os.getenv("BLACKBOOK_MAX_URLS", "5"))


@dataclass
class ResearchResult:
    facts: str = field(default="")
    sources: list[str] = field(default_factory=list)
    monitor_id: str | None = None
    status: ResearchStatus = field(
        default_factory=lambda: ResearchStatus.build(False, False, False, False)
    )


def _dedupe_urls(results: list[dict]) -> list[str]:
    seen: set[str] = set()
    urls: list[str] = []
    for item in results:
        url = item.get("url")
        if url and url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def _to_facts_text(search: list[dict], extracts: list[dict], task: dict) -> str:
    lines: list[str] = []
    lines.append("=== SEARCH RESULTS ===")
    for item in search:
        lines.append(f"- {item.get('title')} ({item.get('url')})")
        for excerpt in item.get("excerpts", [])[:3]:
            lines.append(f"  > {excerpt}")
    lines.append("=== EXTRACTED CONTENT ===")
    for item in extracts:
        lines.append(f"- {item.get('title')} ({item.get('url')})")
        for excerpt in item.get("excerpts", [])[:5]:
            lines.append(f"  > {excerpt}")
    lines.append("=== DEEP RESEARCH TASK ===")
    lines.append(str(task.get("content")))
    return "\n".join(lines)


def _event_fingerprint(event: dict) -> str:
    """Stable identity for a monitor event, used to deduplicate across watches."""
    event_id = event.get("id")
    if event_id:
        return f"id:{event_id}"
    url = event.get("url")
    if url:
        return f"url:{url}"
    content = event.get("content") or ""
    return f"content:{hashlib.sha256(content.encode()).hexdigest()}"


def _coerce_published_at(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


def _require_env(name: str, hint: str) -> None:
    if not os.getenv(name):
        raise RuntimeError(f"{name} is not set. {hint}")


def _decide(ip: str, graph: EvidenceGraph, llm: GeminiClient) -> Assessment:
    return llm.generate_structured(prompts.assessment(ip, graph.model_dump_json()), Assessment)

class Blackbook:
    """Application service wiring LLM + Parallel tools + decision memory together."""

    def __init__(
        self,
        store: DecisionStore | None = None,
        llm: GeminiClient | None = None,
    ) -> None:
        self.store = store or DecisionStore()
        self._llm = llm

    @property
    def llm(self) -> GeminiClient:
        """Lazy Gemini client: constructing Blackbook never requires an API key."""
        if self._llm is None:
            self._llm = GeminiClient()
        return self._llm

    # ---------------------------------------------------------------- evaluate

    def evaluate_ip(self, ip: str, create_monitor: bool = False) -> DecisionRecord:
        if not ip.strip():
            raise ValueError("ip must not be empty")
        _require_env("GOOGLE_API_KEY", "Copy .env.example to .env and set GOOGLE_API_KEY.")

        research = self._research(ip)
        graph = self.llm.generate_structured(
            prompts.evidence_graph(ip, research.facts), EvidenceGraph
        )
        assessment = _decide(ip, graph, self.llm)
        return self._record(
            ip=assessment.ip or ip,
            graph=graph,
            assessment=assessment,
            research=research.status,
            monitor_id=research.monitor_id,
        )

    def _research(self, ip: str) -> ResearchResult:
        plan = self.llm.generate_structured(prompts.research_plan(ip), SearchPlan)
        objective = prompts.research_objective(ip)

        search_results: list[dict] = []
        for query in plan.queries[:_max_queries()]:
            search_results.extend(parallel_search(objective, queries=[query]))

        urls = _dedupe_urls(search_results)[:_max_urls()]
        extracts = parallel_extract(urls) if urls else []

        task_content = None
        deep_task_ok = False
        try:
            task = parallel_task(prompts.task_prompt(ip), processor="base")
            task_content = task.get("content")
            deep_task_ok = True
        except Exception:
            task_content = None

        monitor_id = None
        monitor_ok = False
        if os.getenv("PARALLEL_API_KEY"):
            try:
                monitor_id = create_monitor(prompts.research_objective(ip))
                monitor_ok = True
            except Exception:
                monitor_id = None

        status = ResearchStatus.build(
            search=bool(search_results),
            extract=bool(extracts),
            deep_task=deep_task_ok,
            monitor=monitor_ok,
        )
        facts = _to_facts_text(search_results, extracts, {"content": task_content})
        return ResearchResult(
            facts=facts, sources=urls, monitor_id=monitor_id, status=status
        )

    # ---------------------------------------------------------------- watch

    def watch_decision(self, decision_id: str) -> WatchResult:
        record = self.store.get(decision_id)
        if record is None:
            raise KeyError(f"decision {decision_id} not found")
        if not record.monitor_id:
            return WatchResult(decision_id=decision_id, drifted=False, events_checked=0)

        events = fetch_monitor_events(record.monitor_id)
        if not events:
            return WatchResult(decision_id=decision_id, drifted=False, events_checked=0)

        consumed = set(record.consumed_event_ids or [])
        fresh = [e for e in events if _event_fingerprint(e) not in consumed]
        if not fresh:
            return WatchResult(decision_id=decision_id, drifted=False, events_checked=0)

        evaluation = self.llm.generate_structured(
            prompts.drift(
                record.model_dump_json(), [e.get("content", "") for e in fresh]
            ),
            DriftEvaluation,
        )
        if not evaluation.re_evaluate:
            return WatchResult(
                decision_id=decision_id,
                drifted=evaluation.drifted,
                events_checked=len(fresh),
                evaluation=evaluation,
            )

        updated_graph = record.evidence.model_copy(deep=True)
        for idx, event in enumerate(fresh):
            updated_graph.add_node(self._event_node(idx, event, record.monitor_id))

        assessment = _decide(record.ip, updated_graph, self.llm)
        new_record = self._record(
            ip=record.ip,
            graph=updated_graph,
            assessment=assessment,
            research=record.research,
            monitor_id=record.monitor_id,
            previous_decision_id=record.decision_id,
            status="drift_re_evaluated",
            consumed_event_ids=sorted(
                consumed | {_event_fingerprint(e) for e in fresh}
            ),
        )
        self.store.update_status(record.decision_id, "superseded")

        return WatchResult(
            decision_id=decision_id,
            drifted=True,
            events_checked=len(fresh),
            evaluation=evaluation,
            new_record=new_record,
        )

    @staticmethod
    def _event_node(idx: int, event: dict, fallback_source: str) -> EvidenceNode:
        content = event.get("content") or ""
        source_url = event.get("url") or fallback_source
        return EvidenceNode(
            id=uuid.uuid4().hex[:10],
            entity_type=EntityType.EVENT,
            label=event.get("title") or f"New event {idx + 1}",
            source=source_url,
            source_url=source_url,
            source_title=event.get("title"),
            published_at=_coerce_published_at(event.get("published_at")),
            quote=content[:500],
            properties={
                "event_id": event.get("id"),
                "url": event.get("url"),
                "title": event.get("title"),
                "published_at": event.get("published_at"),
                "event": content,
            },
        )

    # ---------------------------------------------------------------- helpers

    def _record(
        self,
        ip: str,
        graph: EvidenceGraph,
        assessment: Assessment,
        research: ResearchStatus | None,
        monitor_id: str | None = None,
        previous_decision_id: str | None = None,
        status: str = "active",
        consumed_event_ids: list[str] | None = None,
    ) -> DecisionRecord:
        """Build a DecisionRecord with the score/recommendation computed deterministically."""
        score = calculate_score(assessment.component_scores)
        recommendation = recommend(score, assessment.component_scores.rights_confidence)
        record = DecisionRecord(
            ip=ip,
            component_scores=assessment.component_scores,
            reasoning_summary=assessment.reasoning_summary,
            score=score,
            recommendation=recommendation,
            evidence=graph,
            status=status,
            previous_decision_id=previous_decision_id,
            monitor_id=monitor_id,
            research=research,
            consumed_event_ids=consumed_event_ids or [],
        )
        self.store.save(record)
        return record

    # ---------------------------------------------------------------- counterfactual

    def counterfactual(self, decision_id: str) -> CounterfactualAnalysis:
        record = self.store.get(decision_id)
        if record is None:
            raise KeyError(f"decision {decision_id} not found")
        return counterfactual.analyze(record.component_scores)

    # ---------------------------------------------------------------- lineage

    def lineage(self, decision_id: str) -> list[DecisionRecord]:
        """The decision timeline from the original decision up to (and including) this one."""
        chain: list[DecisionRecord] = []
        current_id = decision_id
        seen: set[str] = set()
        while current_id and current_id not in seen:
            seen.add(current_id)
            record = self.store.get(current_id)
            if record is None:
                break
            chain.append(record)
            current_id = record.previous_decision_id
        chain.reverse()
        return chain
