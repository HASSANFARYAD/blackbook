import re

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


def _floor_scores() -> ComponentScores:
    """A PASS decision whose weighted total is exactly 49.5 (a rounding boundary)."""
    return ComponentScores(
        opportunity=70, rights_confidence=35, competition=70, production_feasibility=60
    )


def test_sensitivity_is_exact_across_a_rounding_boundary() -> None:
    # Differencing two independently rounded scores reports these 3s as 4s.
    sens = sensitivity(_floor_scores())
    assert sens["Market opportunity"] == 3
    assert sens["Rights confidence"] == 3
    assert sens["Production feasibility"] == 2
    assert sens["Competition pressure"] == 2


def test_no_reachable_flip_yields_a_scenario_that_does_not_claim_to_flip() -> None:
    # Already at the floor: every worsening swing stays PASS, so the fallback
    # margin-erosion scenario must report the unchanged recommendation.
    scores = _floor_scores()
    current = recommend(calculate_score(scores), scores.rights_confidence)
    assert current is Recommendation.PASS

    scenarios = find_flip_scenarios(scores)
    assert len(scenarios) == 1
    assert scenarios[0].projected_recommendation is current


def test_flip_scenarios_are_ordered_smallest_swing_first():
    """Regression for BUG-03.

    The UI presents the first flip scenario as "the smallest plausible change".
    Scenarios used to come back in the order the components are declared in, so a
    40-point opportunity swing was announced as the smallest change even though a
    10-point rights slip flipped the same decision.
    """
    scores = ComponentScores(
        opportunity=100, rights_confidence=62, competition=0, production_feasibility=100
    )
    assert recommend(calculate_score(scores), scores.rights_confidence) is Recommendation.PURSUE

    scenarios = find_flip_scenarios(scores)
    magnitudes = [abs(int(re.search(r"([+-]\d+) points", s.change).group(1))) for s in scenarios]

    assert magnitudes == sorted(magnitudes), magnitudes
    assert scenarios[0].change.startswith("Rights confidence -10")
    # Every returned scenario really is a flip.
    for scenario in scenarios:
        assert scenario.projected_recommendation is not Recommendation.PURSUE


def test_smallest_flip_wins_even_when_a_larger_swing_is_more_severe():
    """A bigger swing landing on PASS must not outrank a smaller swing landing on WATCH."""
    scores = ComponentScores(
        opportunity=100, rights_confidence=62, competition=0, production_feasibility=100
    )
    scenarios = find_flip_scenarios(scores)
    first_magnitude = abs(int(re.search(r"([+-]\d+) points", scenarios[0].change).group(1)))
    for scenario in scenarios[1:]:
        other = abs(int(re.search(r"([+-]\d+) points", scenario.change).group(1)))
        assert first_magnitude <= other


def test_ties_keep_a_stable_declared_order():
    """Seveneves-shaped scores: several components flip at the same magnitude."""
    scores = ComponentScores(
        opportunity=75, rights_confidence=55, competition=45, production_feasibility=60
    )
    changes = [s.change for s in find_flip_scenarios(scores)]
    assert changes == [
        "Market opportunity -30 points",
        "Rights confidence -30 points",
        "Production feasibility -40 points",
        "Competition pressure +40 points",
    ]
