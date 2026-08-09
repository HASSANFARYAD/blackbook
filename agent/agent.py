"""ADK agent exposing BLACKBOOK as Gemini tools for interactive sessions.

google-adk is an optional extra (`pip install -e ".[agent]"`); the core
pipeline does not depend on it, keeping the base install small.
"""

from __future__ import annotations

import os

from agent.pipeline import Blackbook

APP_NAME = "blackbook"
USER_ID = "studio_dev"


def _blackbook() -> Blackbook:
    return Blackbook()


def evaluate_ip_tool(ip: str) -> dict:
    """Research an IP on the web, build an evidence graph, and return a recommendation (decision_id, score, recommendation)."""
    record = _blackbook().evaluate_ip(ip, create_monitor=True)
    return {
        "decision_id": record.decision_id,
        "ip": record.ip,
        "recommendation": record.recommendation.value,
        "score": record.score,
        "reasoning_summary": record.reasoning_summary,
        "node_count": len(record.evidence.nodes),
        "edge_count": len(record.evidence.edges),
        "evidence_completeness": (
            record.research.completeness if record.research else None
        ),
    }


def watch_decision_tool(decision_id: str) -> dict:
    """Check a monitor for new events and re-evaluate the decision if it drifts."""
    result = _blackbook().watch_decision(decision_id)
    return {
        "decision_id": result.decision_id,
        "drifted": result.drifted,
        "events_checked": result.events_checked,
        "new_decision_id": result.new_record.decision_id if result.new_record else None,
    }


def counterfactual_tool(decision_id: str) -> dict:
    """Simulate what would have to change to flip a decision's recommendation."""
    return _blackbook().counterfactual(decision_id).model_dump(mode="json")


def _adk():
    try:
        from google.adk.agents import Agent
        from google.adk.runners import Runner
        from google.adk.sessions import InMemorySessionService
        from google.genai import types
    except ImportError as exc:
        raise RuntimeError(
            "google-adk is not installed. Install the optional extra: pip install -e '.[agent]'"
        ) from exc
    return Agent, Runner, InMemorySessionService, types


def build_agent():
    Agent, _, _, _ = _adk()
    return Agent(
        name="blackbook",
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        description="AI IP deal intelligence agent for film/TV studio development teams.",
        instruction=(
            "You are BLACKBOOK, an AI IP deal intelligence agent for film/TV studio development "
            "teams. Use the evaluate_ip_tool to research an IP and get a recommendation. Use "
            "watch_decision_tool to check whether new events changed the recommendation. Use "
            "counterfactual_tool to explore what would flip the decision. Present output as "
            "evidence-backed development intelligence, never as legal advice, and explicitly flag "
            "when rights require human/legal verification."
        ),
        tools=[evaluate_ip_tool, watch_decision_tool, counterfactual_tool],
    )


def run_query(query: str, session_id: str = "demo") -> str:
    """Run a single user query against the agent and return the final response text."""
    _, Runner, InMemorySessionService, types = _adk()
    agent = build_agent()
    session_service = InMemorySessionService()
    runner = Runner(agent=agent, app_name=APP_NAME, session_service=session_service)
    content = types.Content(role="user", parts=[types.Part(text=query)])
    final = "No final response."
    for event in runner.run_async(
        user_id=USER_ID, session_id=session_id, new_message=content
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final = event.content.parts[0].text or final
    return final
