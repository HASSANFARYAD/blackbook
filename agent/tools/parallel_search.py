"""Parallel Search tool: natural-language objective -> LLM-optimized excerpts."""

from __future__ import annotations

from agent.tools._client import get_parallel


def parallel_search(
    objective: str,
    queries: list[str] | None = None,
    max_results: int = 5,
) -> list[dict]:
    client = get_parallel()
    response = client.search(objective=objective, search_queries=queries or [objective])
    results = []
    for result in response.results[:max_results]:
        results.append(
            {
                "url": result.url,
                "title": getattr(result, "title", None),
                "publish_date": getattr(result, "publish_date", None),
                "excerpts": list(getattr(result, "excerpts", []) or []),
            }
        )
    return results
