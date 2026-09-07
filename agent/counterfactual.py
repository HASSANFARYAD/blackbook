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
from agent.scoring import (
    WEIGHTS,
    calculate_score,
    calculate_score_raw,
    recommend,
    with_adjusted,
)

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
        delta=delta,
        projected_score=projected,
        projected_recommendation=new_rec,
        explanation=(
            f"{label} {delta:+g} would be consistent with {trigger}. Score moves "
            f"{base_score} -> {projected}; recommendation {current.value} -> {new_rec.value}."
        ),
    )


def sensitivity(scores: ComponentScores) -> dict[str, int]:
    """Total-score impact of a 10-point worsening swing, per component.

    Measured on the unrounded weighted totals and rounded once at the end.
    Differencing two independently rounded scores inflates the result whenever
    they straddle a .5 boundary (a true 3-point impact would report as 4).
    """
    base = calculate_score_raw(scores)
    out: dict[str, int] = {}
    for component in WEIGHTS:
        adjusted = with_adjusted(scores, component, DIRECTIONS[component] * 10)
        out[COMPONENT_LABELS[component]] = round(abs(base - calculate_score_raw(adjusted)))
    return out


def find_flip_scenarios(scores: ComponentScores) -> list[CounterfactualScenario]:
    """Per component, the smallest swing that flips the recommendation.

    Returned smallest-swing-first. The UI presents the head of this list as "the
    smallest plausible change that moves this off X", so the order has to reflect
    magnitude rather than the order the components happen to be declared in --
    otherwise a 40-point opportunity swing gets announced as the smallest change
    while a 10-point rights slip that also flips it sits further down the list.
    """
    current = _current(scores)
    found: list[tuple[int, CounterfactualScenario]] = []
    for component in DIRECTIONS:
        sign = DIRECTIONS[component]
        for magnitude in range(STEP, MAX_SWING + 1, STEP):
            scenario = simulate_change(scores, component, sign * magnitude)
            if scenario.projected_recommendation != current:
                found.append((magnitude, scenario))
                break
    # Stable sort: components tying on magnitude keep their declared order.
    scenarios = [scenario for _, scenario in sorted(found, key=lambda pair: pair[0])]
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
