import pytest

from agent.pipeline import (
    Blackbook,
    _dedupe_urls,
    _event_fingerprint,
    _to_facts_text,
)
from agent.store import DecisionStore


def test_event_fingerprint_stable_across_identities() -> None:
    assert _event_fingerprint({"id": "e1", "url": "https://a.com"}) == "id:e1"
    assert (
        _event_fingerprint({"url": "https://a.com", "content": "x"})
        == "url:https://a.com"
    )
    no_url_a = _event_fingerprint({"content": "same text"})
    no_url_b = _event_fingerprint({"content": "same text"})
    assert no_url_a == no_url_b
    assert _event_fingerprint({"content": "other text"}) != no_url_a


def test_dedupe_urls_preserves_order() -> None:
    results = [
        {"url": "https://a.com"},
        {"url": "https://b.com"},
        {"url": "https://a.com"},
        {},
    ]
    assert _dedupe_urls(results) == ["https://a.com", "https://b.com"]


def test_to_facts_text_contains_sections() -> None:
    text = _to_facts_text(
        search=[{"url": "https://a.com", "title": "A", "excerpts": ["hi"]}],
        extracts=[],
        task={"content": "deep content"},
    )
    assert "SEARCH RESULTS" in text
    assert "DEEP RESEARCH TASK" in text
    assert "deep content" in text


def test_evaluate_ip_requires_api_key(tmp_path, monkeypatch) -> None:
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    monkeypatch.delenv("PARALLEL_API_KEY", raising=False)
    bb = Blackbook(store=DecisionStore(tmp_path / "test.db"))
    with pytest.raises(RuntimeError, match="GOOGLE_API_KEY"):
        bb.evaluate_ip("The Expanse")


def test_watch_unknown_decision_raises(tmp_path) -> None:
    bb = Blackbook(store=DecisionStore(tmp_path / "test.db"))
    with pytest.raises(KeyError):
        bb.watch_decision("nope")


def test_counterfactual_unknown_decision_raises(tmp_path) -> None:
    bb = Blackbook(store=DecisionStore(tmp_path / "test.db"))
    with pytest.raises(KeyError):
        bb.counterfactual("nope")


def test_evaluate_ip_empty_raises(tmp_path) -> None:
    bb = Blackbook(store=DecisionStore(tmp_path / "test.db"))
    with pytest.raises(ValueError):
        bb.evaluate_ip("   ")
