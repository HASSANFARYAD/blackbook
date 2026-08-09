"""Parallel Extract tool: URLs -> clean markdown excerpts (handles JS pages and PDFs)."""

from __future__ import annotations

from agent.tools._client import get_parallel


def parallel_extract(urls: list[str], objective: str | None = None) -> list[dict]:
    client = get_parallel()
    response = client.extract(
        urls=urls,
        objective=objective
        or "Summarize the key facts relevant to evaluating this IP: rights, adaptations, competition, talent, events.",
    )
    results = []
    for result in response.results:
        results.append(
            {
                "url": result.url,
                "title": getattr(result, "title", None),
                "publish_date": getattr(result, "publish_date", None),
                "excerpts": list(getattr(result, "excerpts", []) or []),
            }
        )
    return results
