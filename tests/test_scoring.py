from agent.schemas import ComponentScores, Recommendation
from agent.scoring import calculate_score, recommend, with_adjusted


def _scores(**overrides) -> ComponentScores:
    base = {
        "opportunity": 80,
        "rights_confidence": 90,
        "competition": 30,
        "production_feasibility": 80,
    }
    base.update(overrides)
    return ComponentScores(**base)


def test_calculate_score_weights() -> None:
    # 80*0.3 + 90*0.3 + (100-30)*0.2 + 80*0.2 = 24 + 27 + 14 + 16 = 81
    assert calculate_score(_scores()) == 81


def test_calculate_score_is_deterministic() -> None:
    a = calculate_score(_scores())
    b = calculate_score(_scores())
    assert a == b


def test_competition_lowers_score() -> None:
    low_competition = calculate_score(_scores(competition=10))
    high_competition = calculate_score(_scores(competition=90))
    assert high_competition < low_competition


def test_recommend_thresholds() -> None:
    assert recommend(85, 70) == Recommendation.PURSUE
    assert recommend(82, 50) == Recommendation.WATCH  # rights gate blocks PURSUE
    assert recommend(70, 90) == Recommendation.WATCH
    assert recommend(40, 90) == Recommendation.PASS


def test_with_adjusted_clamps_and_copies() -> None:
    original = _scores()
    adjusted = with_adjusted(original, "rights_confidence", -30)
    assert adjusted.rights_confidence == 60
    assert original.rights_confidence == 90  # original unchanged
    assert with_adjusted(original, "opportunity", -500).opportunity == 0
    assert with_adjusted(original, "opportunity", 500).opportunity == 100


def test_with_adjusted_rejects_unknown_component() -> None:
    try:
        with_adjusted(_scores(), "nope", 10)
        assert False, "expected ValueError"
    except ValueError:
        pass
