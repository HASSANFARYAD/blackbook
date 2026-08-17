"""Shared pytest configuration."""

from __future__ import annotations

import getpass
import os
import tempfile
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent


def _pytest_temp_root() -> Path:
    """Where pytest would put its temp dirs by default."""
    try:
        user = getpass.getuser()
    except Exception:  # pragma: no cover - no resolvable user
        user = "unknown"
    return Path(tempfile.gettempdir()) / f"pytest-of-{user}"


def _writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".write-probe"
        probe.touch()
        probe.unlink()
        return True
    except OSError:
        return False


def pytest_configure(config: pytest.Config) -> None:
    """Keep `tmp_path` working when the system temp root is not writable.

    pytest builds its temp dirs under `<system temp>/pytest-of-<user>`. On some
    locked-down Windows profiles that directory already exists and denies
    access, which fails every test taking `tmp_path`. Redirect to a repo-local
    directory in that case rather than committing a machine-specific path.
    `PYTEST_DEBUG_TEMPROOT` is read lazily by pytest, so this works regardless
    of plugin hook ordering.
    """
    if config.option.basetemp or os.environ.get("PYTEST_DEBUG_TEMPROOT"):
        return
    if _writable(_pytest_temp_root()):
        return
    fallback = REPO_ROOT / ".pytest-tmp"
    fallback.mkdir(parents=True, exist_ok=True)
    os.environ["PYTEST_DEBUG_TEMPROOT"] = str(fallback)
