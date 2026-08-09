"""Deterministic scoring and recommendation engine.

Gemini provides component assessments; this module computes the weighted score
and recommendation so identical inputs always produce identical decisions.
"""

from __future__ import annotations

from agent.schemas import ComponentScores, Recommendation

# Weights must sum to 1.0.
WEIGHTS = {
    "opportunity": 0.30,
    "rights_confidence": 0.30,
    "competition": 0.20,
    "production_feasibility": 0.20,
}

PURSUE_SCORE = 80
WATCH_SCORE = 55
MIN_RIGHTS_FOR_PURSUE = 60


def calculate_score(scores: ComponentScores) -> int:
    """Weighted total. Competition is inverted: more competition lowers the score."""
    raw = (
        scores.opportunity * WEIGHTS["opportunity"]
        + scores.rights_confidence * WEIGHTS["rights_confidence"]
        + (100 - scores.competition) * WEIGHTS["competition"]
        + scores.production_feasibility * WEIGHTS["production_feasibility"]
    )
    return round(raw)


def recommend(score: int, rights_confidence: float) -> Recommendation:
    """Deterministic recommendation from a score and the rights-confidence gate."""
    if score >= PURSUE_SCORE and rights_confidence >= MIN_RIGHTS_FOR_PURSUE:
        return Recommendation.PURSUE
    if score >= WATCH_SCORE:
        return Recommendation.WATCH
    return Recommendation.PASS


def with_adjusted(scores: ComponentScores, component: str, delta: float) -> ComponentScores:
    """Return a copy of scores with one component shifted by delta, clamped 0-100."""
    if component not in WEIGHTS:
        raise ValueError(f"unknown component: {component}")
    values = scores.model_dump()
    values[component] = max(0.0, min(100.0, values[component] + delta))
    return ComponentScores(**values)
