"""Seed a realistic demo dataset into the BLACKBOOK store (no API keys needed).

Creates three IPs, including a full PURSUE -> WATCH -> PASS drift chain for
"The Expanse", so the UI (command center, evidence graph, stress test, timeline)
has rich data to render. Scores/recommendations are computed by the real
deterministic scoring engine.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from agent.schemas import (
    ComponentScores,
    Confidence,
    DecisionRecord,
    EntityType,
    EvidenceEdge,
    EvidenceGraph,
    EvidenceNode,
    RelationshipType,
)
from agent.scoring import calculate_score, recommend
from agent.store import DecisionStore


def _node(
    graph: EvidenceGraph,
    id_: str,
    entity_type: EntityType,
    label: str,
    source_url: str,
    source_title: str,
    confidence: Confidence,
    quote: str | None = None,
) -> EvidenceNode:
    node = EvidenceNode(
        id=id_,
        entity_type=entity_type,
        label=label,
        source=source_url,
        source_url=source_url,
        source_title=source_title,
        confidence=confidence,
        quote=quote,
    )
    graph.add_node(node)
    return node


def _event_node(
    graph: EvidenceGraph,
    title: str,
    source_url: str,
    published_at: str,
    content: str,
) -> EvidenceNode:
    node = EvidenceNode(
        id=uuid.uuid4().hex[:10],
        entity_type=EntityType.EVENT,
        label=title,
        source=source_url,
        source_url=source_url,
        source_title=title,
        published_at=datetime.fromisoformat(published_at),
        confidence=Confidence.HIGH,
        quote=content[:200],
        properties={"event": content, "url": source_url, "title": title},
    )
    graph.add_node(node)
    return node


def _record(
    store: DecisionStore,
    ip: str,
    scores: ComponentScores,
    reasoning: str,
    graph: EvidenceGraph,
    created_at: datetime,
    previous_decision_id: str | None = None,
    status: str = "active",
) -> DecisionRecord:
    score = calculate_score(scores)
    rec = recommend(score, scores.rights_confidence)
    record = DecisionRecord(
        ip=ip,
        component_scores=scores,
        reasoning_summary=reasoning,
        score=score,
        recommendation=rec,
        evidence=graph,
        status=status,
        created_at=created_at,
        previous_decision_id=previous_decision_id,
    )
    store.save(record)
    if status != "active":
        store.update_status(record.decision_id, status)
    return record


def seed(store: DecisionStore) -> None:
    # ------------------------------------------------------------------ Expanse chain
    v1_graph = EvidenceGraph(ip="The Expanse")
    ip1 = _node(
        v1_graph, "ip1", EntityType.IP, "The Expanse",
        "https://en.wikipedia.org/wiki/The_Expanse", "The Expanse — Wikipedia",
        Confidence.HIGH,
    )
    _node(
        v1_graph, "holder1", EntityType.RIGHTS_HOLDER, "Acme Studios",
        "https://deadline.com/2026/01/expanse-option-acme", "Deadline: Acme Studios options The Expanse",
        Confidence.HIGH, "Acme Studios has exercised its option on the rights.",
    )
    _node(
        v1_graph, "comp1", EntityType.COMPETITOR, "Project Orbital",
        "https://variety.com/2026/02/orbital-series", "Variety: Project Orbital in development",
        Confidence.MEDIUM, "A similar hard-SF series is in development elsewhere.",
    )
    v1_graph.add_edge(EvidenceEdge(
        source_id=ip1.id, target_id="holder1", relationship=RelationshipType.OWNS_RIGHTS,
        source="https://deadline.com/2026/01/expanse-option-acme",
        source_url="https://deadline.com/2026/01/expanse-option-acme",
        source_title="Deadline: Acme Studios options The Expanse", confidence=Confidence.HIGH,
    ))
    v1_graph.add_edge(EvidenceEdge(
        source_id=ip1.id, target_id="comp1", relationship=RelationshipType.COMPETES_WITH,
        source="https://variety.com/2026/02/orbital-series",
        source_url="https://variety.com/2026/02/orbital-series",
        source_title="Variety: Project Orbital in development", confidence=Confidence.MEDIUM,
    ))

    v1 = _record(
        store, "The Expanse",
        ComponentScores(opportunity=82, rights_confidence=88, competition=30, production_feasibility=80),
        "Rights verified with a strong holder; hard-SF market demand is high and competition is light.",
        v1_graph,
        datetime(2026, 8, 9, 10, 0, tzinfo=timezone.utc),
        status="superseded",
    )

    v2_graph = v1_graph.model_copy(deep=True)
    _event_node(
        v2_graph,
        "Major competing adaptation announced",
        "https://news.example.com/competing-adaptation",
        "2026-08-14T00:00:00Z",
        "A major studio announced a competing adaptation of the same source material, "
        "raising the competitive pressure on this project.",
    )
    v2 = _record(
        store, "The Expanse",
        ComponentScores(opportunity=82, rights_confidence=88, competition=55, production_feasibility=80),
        "A major competing adaptation was announced; competition rose sharply.",
        v2_graph,
        datetime(2026, 8, 14, 9, 30, tzinfo=timezone.utc),
        previous_decision_id=v1.decision_id,
        status="superseded",
    )

    v3_graph = v2_graph.model_copy(deep=True)
    _event_node(
        v3_graph,
        "Rights holder sold option to competitor",
        "https://news.example.com/rights-sold",
        "2026-08-21T00:00:00Z",
        "The rights holder sold its option to a competitor, undermining rights confidence "
        "for this project.",
    )
    _record(
        store, "The Expanse",
        ComponentScores(opportunity=70, rights_confidence=35, competition=70, production_feasibility=60),
        "Rights were sold to a competitor and competition intensified; feasibility weakened.",
        v3_graph,
        datetime(2026, 8, 21, 8, 0, tzinfo=timezone.utc),
        previous_decision_id=v2.decision_id,
    )

    # ------------------------------------------------------------------ Dune: Messiah
    dune_graph = EvidenceGraph(ip="Dune: Messiah")
    ipd = _node(
        dune_graph, "ipd", EntityType.IP, "Dune: Messiah",
        "https://en.wikipedia.org/wiki/Dune_Messiah", "Dune: Messiah — Wikipedia",
        Confidence.HIGH,
    )
    _node(
        dune_graph, "holderd", EntityType.RIGHTS_HOLDER, "Legendary Entertainment",
        "https://deadline.com/2026/05/dune-messiah-legendary", "Deadline: Legendary greenlights Dune: Messiah",
        Confidence.HIGH, "Legendary Entertainment holds the adaptation rights.",
    )
    dune_graph.add_edge(EvidenceEdge(
        source_id=ipd.id, target_id="holderd", relationship=RelationshipType.OWNS_RIGHTS,
        source="https://deadline.com/2026/05/dune-messiah-legendary",
        source_url="https://deadline.com/2026/05/dune-messiah-legendary",
        source_title="Deadline: Legendary greenlights Dune: Messiah", confidence=Confidence.HIGH,
    ))
    _record(
        store, "Dune: Messiah",
        ComponentScores(opportunity=90, rights_confidence=85, competition=20, production_feasibility=85),
        "Beloved IP with an established studio; rights are clear and competition is minimal.",
        dune_graph,
        datetime(2026, 8, 10, 12, 0, tzinfo=timezone.utc),
    )

    # ------------------------------------------------------------------ Seveneves (WATCH, reachable PASS flip)
    seveneves_graph = EvidenceGraph(ip="Seveneves")
    ips = _node(
        seveneves_graph, "ips", EntityType.IP, "Seveneves",
        "https://en.wikipedia.org/wiki/Seveneves", "Seveneves — Wikipedia",
        Confidence.HIGH,
    )
    _node(
        seveneves_graph, "holders", EntityType.RIGHTS_HOLDER, "Nimbus Pictures",
        "https://hollywoodreporter.com/2026/03/seveneves-nimbus", "THR: Nimbus in talks for Seveneves",
        Confidence.MEDIUM, "Rights talks are ongoing but not final.",
    )
    seveneves_graph.add_edge(EvidenceEdge(
        source_id=ips.id, target_id="holders", relationship=RelationshipType.OWNS_RIGHTS,
        source="https://hollywoodreporter.com/2026/03/seveneves-nimbus",
        source_url="https://hollywoodreporter.com/2026/03/seveneves-nimbus",
        source_title="THR: Nimbus in talks for Seveneves", confidence=Confidence.MEDIUM,
    ))
    _record(
        store, "Seveneves",
        ComponentScores(opportunity=75, rights_confidence=55, competition=45, production_feasibility=60),
        "Strong premise but rights are not yet confirmed, holding the recommendation at WATCH.",
        seveneves_graph,
        datetime(2026, 8, 12, 15, 0, tzinfo=timezone.utc),
    )
