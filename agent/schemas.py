"""Shared schemas for BLACKBOOK: evidence, decisions, drift, and counterfactuals."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EntityType(str, Enum):
    IP = "ip"
    RIGHTS_HOLDER = "rights_holder"
    TERRITORY = "territory"
    ADAPTATION = "adaptation"
    COMPETITOR = "competitor"
    TALENT = "talent"
    EVENT = "event"
    OTHER = "other"


class RelationshipType(str, Enum):
    OWNS_RIGHTS = "owns_rights"
    ADAPTED_INTO = "adapted_into"
    COMPETES_WITH = "competes_with"
    ATTACHED_TO = "attached_to"
    EVENT_IMPACTS = "event_impacts"
    MENTIONS = "mentions"


class Confidence(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class EvidenceNode(BaseModel):
    id: str
    entity_type: EntityType
    label: str
    properties: dict[str, Any] = Field(default_factory=dict)
    source: str
    source_url: str | None = None
    source_title: str | None = None
    published_at: datetime | None = None
    observed_at: datetime = Field(default_factory=utcnow)
    confidence: Confidence = Confidence.MEDIUM
    quote: str | None = None


class EvidenceEdge(BaseModel):
    source_id: str
    target_id: str
    relationship: RelationshipType
    source: str
    source_url: str | None = None
    source_title: str | None = None
    published_at: datetime | None = None
    observed_at: datetime = Field(default_factory=utcnow)
    confidence: Confidence = Confidence.MEDIUM
    quote: str | None = None


class EvidenceGraph(BaseModel):
    ip: str
    nodes: list[EvidenceNode] = Field(default_factory=list)
    edges: list[EvidenceEdge] = Field(default_factory=list)

    def add_node(self, node: EvidenceNode) -> EvidenceNode:
        self.nodes.append(node)
        return node

    def add_edge(self, edge: EvidenceEdge) -> None:
        self.edges.append(edge)

    def to_payload(self) -> dict[str, Any]:
        return {
            "ip": self.ip,
            "nodes": [n.model_dump(mode="json") for n in self.nodes],
            "edges": [e.model_dump(mode="json") for e in self.edges],
        }


class ComponentScores(BaseModel):
    opportunity: float = Field(ge=0, le=100)
    competition: float = Field(ge=0, le=100)
    rights_confidence: float = Field(ge=0, le=100)
    production_feasibility: float = Field(ge=0, le=100)


class Recommendation(str, Enum):
    PURSUE = "PURSUE"
    WATCH = "WATCH"
    PASS = "PASS"
    REASSESS = "REASSESS"


class Assessment(BaseModel):
    """What Gemini produces: component assessments plus reasoning, no final score."""

    ip: str
    component_scores: ComponentScores
    reasoning_summary: str


class ResearchStatus(BaseModel):
    """Per-stage research health; completeness is the fraction of required stages that succeeded."""

    search: bool = False
    extract: bool = False
    deep_task: bool = False
    monitor: bool = False
    completeness: float = Field(ge=0.0, le=1.0)

    @classmethod
    def build(
        cls,
        search: bool,
        extract: bool,
        deep_task: bool,
        monitor: bool,
    ) -> ResearchStatus:
        required = [search, extract, deep_task]
        completeness = round(sum(required) / len(required), 2)
        return cls(
            search=search,
            extract=extract,
            deep_task=deep_task,
            monitor=monitor,
            completeness=completeness,
        )


class Decision(BaseModel):
    ip: str
    recommendation: Recommendation
    score: int = Field(ge=0, le=100)
    component_scores: ComponentScores
    reasoning_summary: str


class DecisionRecord(Decision):
    decision_id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    evidence: EvidenceGraph
    status: str = "active"
    created_at: datetime = Field(default_factory=utcnow)
    previous_decision_id: str | None = None
    monitor_id: str | None = None
    research: ResearchStatus | None = None
    consumed_event_ids: list[str] = Field(default_factory=list)


class SearchPlan(BaseModel):
    queries: list[str]


class DriftEvaluation(BaseModel):
    decision_id: str
    drifted: bool
    new_events: list[str] = Field(default_factory=list)
    changed_factors: list[str] = Field(default_factory=list)
    impact: str
    re_evaluate: bool


class WatchResult(BaseModel):
    decision_id: str
    drifted: bool
    events_checked: int = 0
    evaluation: DriftEvaluation | None = None
    new_record: DecisionRecord | None = None


class CounterfactualScenario(BaseModel):
    change: str
    projected_score: int = Field(ge=0, le=100)
    projected_recommendation: Recommendation
    explanation: str


class CounterfactualAnalysis(BaseModel):
    sensitivity: dict[str, int] = Field(default_factory=dict)
    scenarios: list[CounterfactualScenario] = Field(default_factory=list)
