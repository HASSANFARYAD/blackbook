"""Prompt templates for the BLACKBOOK agent loop."""

from __future__ import annotations


def research_plan(ip: str) -> str:
    return (
        "You are a studio IP development researcher. Given the intellectual property below, "
        "generate up to 5 targeted web search queries that would reveal: the rights holders and "
        "option status, existing or planned adaptations, competing similar projects at other studios, "
        "talent attachment, and recent market-relevant events.\n"
        f'IP: "{ip}"\n'
        'Return JSON: {"queries": ["...", "..."]}'
    )


def research_objective(ip: str) -> str:
    return (
        f"Gather evidence to evaluate the IP '{ip}' for development by a film/TV studio. "
        "Focus on rights status, current holders, adaptations, competition, talent, and recent events."
    )


def task_prompt(ip: str) -> str:
    return (
        f"Research the intellectual property '{ip}' and report: who currently holds the rights, "
        "whether any option deals exist, prior adaptations, similar projects in development elsewhere, "
        "and any notable recent announcements. Cite a source for every claim."
    )


def evidence_graph(ip: str, facts: str) -> str:
    return (
        'Convert the researched evidence below into a structured evidence graph about the IP "%s". '
        "Use nodes for entities (rights holders, territories, adaptations, competitors, talent, events) "
        "and edges for relationships. Every node and edge must carry full provenance: a source URL, "
        "the source title, the publication date if known, a confidence (high|medium|low) based on how "
        "directly the evidence supports it, and a short quote from the evidence.\n"
        "EVIDENCE:\n%s\n"
        "Return JSON conforming to the EvidenceGraph schema." % (ip, facts)
    )


def assessment(ip: str, graph_json: str) -> str:
    return (
        'You are a studio development executive assessing an IP: "%s". '
        "Score four components 0-100 based on the evidence and explain your reasoning.\n"
        "- opportunity: market demand, audience, commercial potential\n"
        "- competition: severity of competing/adapted projects (0 = none, 100 = heavy competition)\n"
        "- rights_confidence: how clearly the rights can be obtained or verified\n"
        "- production_feasibility: talent availability, budget fit, format viability\n"
        "Do NOT compute a final score or recommendation - the system does that deterministically. "
        "This is development intelligence, not legal advice - explicitly flag when human/legal "
        "verification of rights is required.\n"
        "EVIDENCE GRAPH (JSON):\n%s\n"
        "Return JSON conforming to the Assessment schema." % (ip, graph_json)
    )


def drift(decision_json: str, events: list[str]) -> str:
    events_text = "\n".join(f"- {e}" for e in events)
    return (
        "You are a decision-drift monitor. The system made a recommendation about an IP and has since "
        "detected new web events. Determine whether the new information materially changes the "
        "competitive landscape, rights confidence, or market opportunity.\n"
        f"CURRENT DECISION (JSON):\n{decision_json}\n"
        f"NEW EVENTS:\n{events_text}\n"
        "Return JSON conforming to the DriftEvaluation schema. Set drifted=true and re_evaluate=true "
        "only if at least one event could materially change the recommendation."
    )
