from agent.schemas import DecisionRecord, EvidenceGraph, Recommendation
from agent.store import DecisionStore


def _make_record(ip: str = "The Expanse") -> DecisionRecord:
    return DecisionRecord(
        ip=ip,
        recommendation=Recommendation.PURSUE,
        score=82,
        component_scores={
            "opportunity": 85,
            "competition": 60,
            "rights_confidence": 75,
            "production_feasibility": 70,
        },
        reasoning_summary="Strong market fit.",
        evidence=EvidenceGraph(ip=ip),
    )


def test_store_roundtrip(tmp_path) -> None:
    store = DecisionStore(tmp_path / "test.db")
    record = _make_record()
    store.save(record)

    loaded = store.get(record.decision_id)
    assert loaded is not None
    assert loaded.decision_id == record.decision_id
    assert loaded.recommendation == Recommendation.PURSUE
    assert loaded.evidence.ip == "The Expanse"

    store.close()


def test_store_list_orders_by_recency(tmp_path) -> None:
    store = DecisionStore(tmp_path / "test.db")
    first = _make_record(ip="First IP")
    second = _make_record(ip="Second IP")
    store.save(first)
    store.save(second)

    records = store.list()
    assert [r.decision_id for r in records] == [second.decision_id, first.decision_id]

    store.close()


def test_store_update_status(tmp_path) -> None:
    store = DecisionStore(tmp_path / "test.db")
    record = _make_record()
    store.save(record)
    store.update_status(record.decision_id, "superseded")

    assert store.get(record.decision_id).status == "superseded"
    store.close()


def test_store_missing_decision_returns_none(tmp_path) -> None:
    store = DecisionStore(tmp_path / "test.db")
    assert store.get("does-not-exist") is None
    store.close()
