"""Deterministic counterfactual decision simulation.

Identifies the smallest plausible changes that would flip a recommendation (or
materially erode the score) by running scenarios through the same deterministic
scoring engine used for the original decision. No LLM-invented arithmetic.
"""

from __future__ import annotations

from agent.schemas import (
    ComponentScores,
    CounterfactualAnalysis,
    CounterfactualScenario,
)
from agent.scoring import WEIGHTS, calculate_score, recommend, with_adjusted

COMPONENT_LABELS = {
    "opportunity": "Market opportunity",
    "rights_confidence": "Rights confidence",
    "production_feasibility": "Production feasibility",
    "competition": "Competition pressure",
}

TRIGGERS = {
    "opportunity": "a weaker market or audience outlook",
    "rights_confidence": "rights availability that cannot be verified",
    "production_feasibility": "a key talent or financing gap",
    "competition": "a competing adaptation announcement",
}

# Worsening direction for each component (competition is inverted).
DIRECTIONS = {
    "opportunity": -1,
    "rights_confidence": -1,
    "production_feasibility": -1,
    "competition": 1,
}

MAX_SWING = 60
STEP = 10


def _current(scores: ComponentScores):
    return recommend(calculate_score(scores), scores.rights_confidence)


def simulate_change(scores: ComponentScores, component: str, delta: float) -> CounterfactualScenario:
    adjusted = with_adjusted(scores, component, delta)
    projected = calculate_score(adjusted)
    base_score = calculate_score(scores)
    new_rec = recommend(projected, adjusted.rights_confidence)
    current = _current(scores)
    label = COMPONENT_LABELS[component]
    trigger = TRIGGERS[component]
    return CounterfactualScenario(
        change=f"{label} {delta:+g} points",
        projected_score=projected,
        projected_recommendation=new_rec,
        explanation=(
            f"{label} {delta:+g} would be consistent with {trigger}. Score moves "
            f"{base_score} -> {projected}; recommendation {current.value} -> {new_rec.value}."
        ),
    )


def sensitivity(scores: ComponentScores) -> dict[str, int]:
    """Total-score impact of a 10-point worsening swing, per component."""
    base = calculate_score(scores)
    out: dict[str, int] = {}
    for component in WEIGHTS:
        adjusted = with_adjusted(scores, component, DIRECTIONS[component] * 10)
        out[COMPONENT_LABELS[component]] = abs(base - calculate_score(adjusted))
    return out


def find_flip_scenarios(scores: ComponentScores) -> list[CounterfactualScenario]:
    current = _current(scores)
    scenarios: list[CounterfactualScenario] = []
    for component in DIRECTIONS:
        sign = DIRECTIONS[component]
        for magnitude in range(STEP, MAX_SWING + 1, STEP):
            scenario = simulate_change(scores, component, sign * magnitude)
            if scenario.projected_recommendation != current:
                scenarios.append(scenario)
                break
    if not scenarios:
        # No reachable flip: surface the material margin erosion instead.
        sens = sensitivity(scores)
        component = max(WEIGHTS, key=lambda c: sens[COMPONENT_LABELS[c]])
        scenarios.append(simulate_change(scores, component, DIRECTIONS[component] * MAX_SWING))
    return scenarios


def analyze(scores: ComponentScores) -> CounterfactualAnalysis:
    return CounterfactualAnalysis(
        sensitivity=sensitivity(scores),
        scenarios=find_flip_scenarios(scores),
    )
