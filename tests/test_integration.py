"""Integration test: proves the complete BLACKBOOK drift loop end to end.

Evaluate IP -> Decision #1 -> monitor event -> materiality check -> re-evaluation
-> Decision #2 linked via previous_decision_id -> drift timeline.

All external services (Parallel tools, Gemini) are mocked; the deterministic
scoring engine and decision memory run for real.
"""

from __future__ import annotations

import pytest

import agent.pipeline as pipeline
from agent.pipeline import Blackbook
from agent.schemas import (
    Assessment,
    DriftEvaluation,
    EntityType,
    EvidenceEdge,
    EvidenceGraph,
    EvidenceNode,
    Recommendation,
    RelationshipType,
    SearchPlan,
)
from agent.store import DecisionStore

INITIAL_SCORES = {
    "opportunity": 85,
    "rights_confidence": 90,
    "competition": 25,
    "production_feasibility": 80,
}

DRIFTED_SCORES = {
    "opportunity": 85,
    "rights_confidence": 90,
    "competition": 75,
    "production_feasibility": 80,
}

NEW_EVENT = {
    "id": "evt-2",
    "title": "Major competing adaptation announced",
    "url": "https://news.example.com/competing-adaptation",
    "published_at": "2026-08-14T00:00:00Z",
    "content": (
        "A major studio announced a competing adaptation of the same source material, "
        "raising the competitive pressure on this project."
    ),
}


def _initial_graph() -> EvidenceGraph:
    graph = EvidenceGraph(ip="The Expanse")
    ip_node = graph.add_node(
        EvidenceNode(
            id="ip",
            entity_type=EntityType.IP,
            label="The Expanse",
            source="https://example.com/ip",
            source_url="https://example.com/ip",
            source_title="Series overview",
        )
    )
    holder = graph.add_node(
        EvidenceNode(
            id="holder",
            entity_type=EntityType.RIGHTS_HOLDER,
            label="Acme Studios",
            source="https://example.com/rights",
            source_url="https://example.com/rights",
            source_title="Rights filing",
        )
    )
    graph.add_edge(
        EvidenceEdge(
            source_id=ip_node.id,
            target_id=holder.id,
            relationship=RelationshipType.OWNS_RIGHTS,
            source="https://example.com/rights",
            source_url="https://example.com/rights",
            source_title="Rights filing",
        )
    )
    return graph


class FakeLLM:
    """Responds to each generate_structured call based on the requested schema."""

    def __init__(self) -> None:
        self.assessment_calls = 0

    def generate_text(self, prompt: str) -> str:
        return "mocked"

    def generate_structured(self, prompt: str, schema):
        name = schema.__name__
        if name == "SearchPlan":
            return SearchPlan(queries=["rights and option status", "recent events"])
        if name == "EvidenceGraph":
            return _initial_graph()
        if name == "Assessment":
            self.assessment_calls += 1
            scores = INITIAL_SCORES if self.assessment_calls == 1 else DRIFTED_SCORES
            return Assessment(
                ip="The Expanse",
                component_scores=scores,
                reasoning_summary="mocked reasoning",
            )
        if name == "DriftEvaluation":
            return DriftEvaluation(
                decision_id="any",
                drifted=True,
                new_events=["Major competing adaptation announced"],
                changed_factors=["competition"],
                impact="A major competing adaptation was announced, increasing competition.",
                re_evaluate=True,
            )
        raise AssertionError(f"unexpected schema: {name}")


@pytest.fixture
def blackbook(tmp_path, monkeypatch) -> Blackbook:
    monkeypatch.setenv("GOOGLE_API_KEY", "fake-key")
    monkeypatch.setenv("PARALLEL_API_KEY", "fake-key")

    monkeypatch.setattr(
        pipeline,
        "parallel_search",
        lambda objective, queries=None: [
            {"url": "https://a.com", "title": "Source A", "excerpts": ["excerpt"]}
        ],
    )
    monkeypatch.setattr(
        pipeline,
        "parallel_extract",
        lambda urls: [
            {"url": u, "title": "Extracted", "excerpts": ["detail"]} for u in urls
        ],
    )
    monkeypatch.setattr(
        pipeline, "parallel_task", lambda *args, **kwargs: {"content": "deep research"}
    )
    monkeypatch.setattr(pipeline, "create_monitor", lambda *args, **kwargs: "mon-1")

    events: dict[str, list[dict]] = {}

    def fake_fetch_events(monitor_id: str) -> list[dict]:
        return list(events.get(monitor_id, []))

    monkeypatch.setattr(pipeline, "fetch_monitor_events", fake_fetch_events)

    bb = Blackbook(store=DecisionStore(tmp_path / "integration.db"), llm=FakeLLM())
    bb._events = events
    return bb


def test_decision_drift_creates_linked_revision(blackbook: Blackbook) -> None:
    events: dict[str, list[dict]] = blackbook._events

    decision1 = blackbook.evaluate_ip("The Expanse", create_monitor=True)

    assert decision1.recommendation == Recommendation.PURSUE
    assert decision1.monitor_id == "mon-1"
    assert decision1.previous_decision_id is None
    assert decision1.consumed_event_ids == []

    events["mon-1"] = [NEW_EVENT]

    result = blackbook.watch_decision(decision1.decision_id)
    assert result.drifted is True
    assert result.events_checked == 1
    assert result.new_record is not None

    decision2 = result.new_record
    assert decision2.decision_id != decision1.decision_id
    assert decision2.recommendation == Recommendation.WATCH
    assert decision2.score < decision1.score
    assert decision2.previous_decision_id == decision1.decision_id
    assert decision2.consumed_event_ids == ["id:evt-2"]
    assert decision2.monitor_id == "mon-1"

    event_nodes = [
        n for n in decision2.evidence.nodes if n.entity_type == EntityType.EVENT
    ]
    assert len(event_nodes) == 1
    event_node = event_nodes[0]
    assert event_node.source_url == NEW_EVENT["url"]
    assert event_node.source_title == NEW_EVENT["title"]
    assert event_node.published_at is not None
    assert NEW_EVENT["content"] in (event_node.properties or {}).get("event", "")

    assert blackbook.store.get(decision1.decision_id).status == "superseded"

    lineage = blackbook.lineage(decision2.decision_id)
    assert [r.decision_id for r in lineage] == [
        decision1.decision_id,
        decision2.decision_id,
    ]


def test_same_monitor_event_does_not_create_duplicate_revision(blackbook) -> None:
    events: dict[str, list[dict]] = blackbook._events

    decision1 = blackbook.evaluate_ip("The Expanse", create_monitor=True)
    events["mon-1"] = [NEW_EVENT]

    result = blackbook.watch_decision(decision1.decision_id)
    assert result.drifted is True
    decision2 = result.new_record
    assert decision2 is not None
    assert len(blackbook.store.list()) == 2

    result_again = blackbook.watch_decision(decision2.decision_id)
    assert result_again.drifted is False
    assert result_again.new_record is None
    assert result_again.events_checked == 0
    assert len(blackbook.store.list()) == 2
