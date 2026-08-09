from agent.schemas import (
    Assessment,
    Confidence,
    Decision,
    DecisionRecord,
    EvidenceEdge,
    EvidenceGraph,
    EvidenceNode,
    EntityType,
    Recommendation,
    RelationshipType,
    ResearchStatus,
)


def test_evidence_node_defaults() -> None:
    node = EvidenceNode(
        id="n1",
        entity_type=EntityType.IP,
        label="The Expanse",
        source="https://example.com",
    )
    assert node.confidence == Confidence.MEDIUM
    assert node.properties == {}
    assert node.quote is None
    assert node.observed_at is not None


def test_graph_add_and_payload() -> None:
    graph = EvidenceGraph(ip="The Expanse")
    ip_node = graph.add_node(
        EvidenceNode(id="ip", entity_type=EntityType.IP, label="The Expanse", source="s")
    )
    holder = graph.add_node(
        EvidenceNode(
            id="h1",
            entity_type=EntityType.RIGHTS_HOLDER,
            label="Acme Studios",
            source="https://example.com",
        )
    )
    graph.add_edge(
        EvidenceEdge(
            source_id=ip_node.id,
            target_id=holder.id,
            relationship=RelationshipType.OWNS_RIGHTS,
            source="https://example.com",
        )
    )

    payload = graph.to_payload()
    assert len(payload["nodes"]) == 2
    assert len(payload["edges"]) == 1
    assert payload["edges"][0]["relationship"] == "owns_rights"
    assert payload["ip"] == "The Expanse"


def test_recommendation_values() -> None:
    assert Recommendation.PURSUE.value == "PURSUE"
    assert Recommendation.PASS.value == "PASS"
    assert Recommendation.WATCH.value == "WATCH"
    assert Recommendation.REASSESS.value == "REASSESS"


def test_decision_record_defaults() -> None:
    record = DecisionRecord(
        ip="The Expanse",
        recommendation=Recommendation.PURSUE,
        score=82,
        component_scores={
            "opportunity": 85,
            "competition": 60,
            "rights_confidence": 75,
            "production_feasibility": 70,
        },
        reasoning_summary="Strong market fit.",
        evidence=EvidenceGraph(ip="The Expanse"),
    )
    assert record.decision_id
    assert record.status == "active"
    assert record.previous_decision_id is None
    assert record.monitor_id is None
    assert record.score == 82
    assert record.component_scores.rights_confidence == 75


def test_research_status_completeness() -> None:
    full = ResearchStatus.build(search=True, extract=True, deep_task=True, monitor=True)
    assert full.completeness == 1.0
    partial = ResearchStatus.build(search=True, extract=True, deep_task=False, monitor=True)
    assert partial.completeness == 0.67
    assert partial.monitor is True


def test_assessment_schema() -> None:
    assessment = Assessment(
        ip="The Expanse",
        component_scores={
            "opportunity": 85,
            "competition": 30,
            "rights_confidence": 75,
            "production_feasibility": 70,
        },
        reasoning_summary="Strong market fit.",
    )
    assert assessment.component_scores.competition == 30


def test_decision_json_roundtrip() -> None:
    record = DecisionRecord(
        ip="The Expanse",
        recommendation=Recommendation.WATCH,
        score=55,
        component_scores={
            "opportunity": 60,
            "competition": 50,
            "rights_confidence": 55,
            "production_feasibility": 60,
        },
        reasoning_summary="Rights unverified.",
        evidence=EvidenceGraph(ip="The Expanse"),
    )
    clone = DecisionRecord.model_validate_json(record.model_dump_json())
    assert clone == record
