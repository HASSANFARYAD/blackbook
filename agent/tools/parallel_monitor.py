"""Parallel Monitor tool: persistent watch for material changes on the web."""

from __future__ import annotations

from agent.tools._client import get_parallel


def create_monitor(query: str, frequency: str = "1d", processor: str = "lite") -> str:
    """Create an event_stream monitor and return its monitor_id."""
    client = get_parallel()
    monitor = client.monitor.create(
        type="event_stream",
        frequency=frequency,
        processor=processor,
        settings={"query": query},
    )
    return monitor.monitor_id


def fetch_monitor_events(monitor_id: str) -> list[dict]:
    """Return events detected so far, with provenance (id, title, url, published_at) when available."""
    client = get_parallel()
    try:
        result = client.monitor.events(monitor_id)
    except Exception:
        # No event group yet (first run or nothing material detected yet).
        return []
    events: list[dict] = []
    for event in getattr(result, "events", None) or []:
        output = getattr(event, "output", None) or {}
        content = (
            output.get("content")
            if isinstance(output, dict)
            else getattr(output, "content", None)
        )
        if not content:
            continue
        events.append(
            {
                "id": getattr(event, "id", None),
                "title": getattr(event, "title", None),
                "url": getattr(event, "url", None),
                "published_at": getattr(event, "published_at", None),
                "content": content,
            }
        )
    return events
