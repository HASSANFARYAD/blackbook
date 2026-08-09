"""Parallel Task tool: deep multi-hop research with cited, structured output."""

from __future__ import annotations

from agent.tools._client import get_parallel


def parallel_task(input_: str, processor: str = "base") -> dict:
    """Run a deep-research task. Returns output content plus per-field citations."""
    client = get_parallel()
    task_run = client.task_run.create(input=input_, processor=processor)
    result = client.task_run.result(task_run.run_id, api_timeout=3600)
    output = getattr(result, "output", None)
    if isinstance(output, dict):
        content = output.get("content")
        basis = output.get("basis")
    else:
        content = getattr(output, "content", None)
        basis = getattr(output, "basis", None)
    citations = []
    for field in basis or []:
        field_name = getattr(field, "field", None) or field.get("field")
        field_citations = getattr(field, "citations", None) or field.get("citations")
        citations.append({"field": field_name, "citations": list(field_citations or [])})
    return {"content": content, "basis": citations}
