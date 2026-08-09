from agent.counterfactual import (
    analyze,
    find_flip_scenarios,
    sensitivity,
    simulate_change,
)
from agent.schemas import ComponentScores, Recommendation
from agent.scoring import calculate_score, recommend


def _scores(**overrides) -> ComponentScores:
    base = {
        "opportunity": 82,
        "rights_confidence": 91,
        "competition": 30,
        "production_feasibility": 76,
    }
    base.update(overrides)
    return ComponentScores(**base)


def test_sensitivity_is_deterministic_and_weighted() -> None:
    sens = sensitivity(_scores())
    # A 10-point swing in opportunity / rights moves the total by 3 points;
    # in competition / feasibility by 2 points.
    assert sens["Market opportunity"] == 3
    assert sens["Rights confidence"] == 3
    assert sens["Production feasibility"] == 2
    assert sens["Competition pressure"] == 2


def test_simulate_change_recomputes_score_deterministically() -> None:
    scores = _scores()
    scenario = simulate_change(scores, "competition", 40)
    adjusted = ComponentScores(**(scores.model_dump() | {"competition": 70}))
    assert scenario.projected_score == calculate_score(adjusted)
    assert scenario.projected_recommendation == recommend(
        scenario.projected_score, adjusted.rights_confidence
    )


def test_flip_scenarios_actually_flip() -> None:
    scores = _scores()
    current = recommend(calculate_score(scores), scores.rights_confidence)
    for scenario in find_flip_scenarios(scores):
        assert scenario.projected_recommendation != current


def test_flip_scenarios_find_competition_flip() -> None:
    # Raising competition far enough must eventually flip the decision.
    scenarios = find_flip_scenarios(_scores(competition=10))
    changes = [s.change for s in scenarios]
    assert any("Competition" in c for c in changes)


def test_analyze_builds_full_analysis() -> None:
    analysis = analyze(_scores())
    assert set(analysis.sensitivity.keys()) == {
        "Market opportunity",
        "Rights confidence",
        "Production feasibility",
        "Competition pressure",
    }
    assert analysis.scenarios  # non-empty


def test_analyze_returns_non_empty_when_no_flip_reachable() -> None:
    # A perfect IP that stays PURSUE even under max swings still gets a scenario.
    scores = _scores(opportunity=95, rights_confidence=95, competition=5, production_feasibility=95)
    analysis = analyze(scores)
    assert analysis.scenarios
