"""Shared Parallel client access (lazy singleton reading PARALLEL_API_KEY)."""

from __future__ import annotations

import os

from parallel import Parallel

_parallel: Parallel | None = None


def get_parallel() -> Parallel:
    global _parallel
    if _parallel is None:
        api_key = os.getenv("PARALLEL_API_KEY")
        if not api_key:
            raise RuntimeError(
                "PARALLEL_API_KEY is not set. Copy .env.example to .env and add your "
                "Parallel API key from https://platform.parallel.ai"
            )
        _parallel = Parallel(api_key=api_key)
    return _parallel
