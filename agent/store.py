"""Decision memory: durable persistence for decisions, evidence, and drift state."""

from __future__ import annotations

import os
import sqlite3
import threading
from pathlib import Path

from agent.schemas import DecisionRecord

DEFAULT_DB_PATH = "blackbook.db"


class DecisionStore:
    """SQLite-backed store for DecisionRecords (full evidence payload preserved)."""

    def __init__(self, path: str | os.PathLike = DEFAULT_DB_PATH) -> None:
        self._path = Path(path)
        if str(self._path) != ":memory:":
            self._path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        # The connection is shared across FastAPI's sync threadpool, so every
        # statement is serialised here.
        self._lock = threading.Lock()
        self._init_schema()

    def _init_schema(self) -> None:
        self._conn.execute(
            """
            CREATE TABLE IF NOT EXISTS decisions (
                decision_id TEXT PRIMARY KEY,
                ip TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                score INTEGER NOT NULL,
                payload TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                previous_decision_id TEXT,
                created_at TEXT NOT NULL
            )
            """
        )
        self._conn.commit()

    def save(self, decision: DecisionRecord) -> None:
        with self._lock:
            self._save(decision)

    def _save(self, decision: DecisionRecord) -> None:
        self._conn.execute(
            """
            INSERT INTO decisions (
                decision_id, ip, recommendation, score, payload, status, previous_decision_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(decision_id) DO UPDATE SET
                ip = excluded.ip,
                recommendation = excluded.recommendation,
                score = excluded.score,
                payload = excluded.payload,
                status = excluded.status,
                previous_decision_id = excluded.previous_decision_id,
                created_at = excluded.created_at
            """,
            (
                decision.decision_id,
                decision.ip,
                decision.recommendation.value,
                decision.score,
                decision.model_dump_json(),
                decision.status,
                decision.previous_decision_id,
                decision.created_at.isoformat(),
            ),
        )
        self._conn.commit()

    def get(self, decision_id: str) -> DecisionRecord | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT payload, status FROM decisions WHERE decision_id = ?",
                (decision_id,),
            ).fetchone()
        return self._hydrate(row) if row else None

    def list(self) -> list[DecisionRecord]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT payload, status FROM decisions ORDER BY created_at DESC"
            ).fetchall()
        return [self._hydrate(row) for row in rows]

    @staticmethod
    def _hydrate(row: sqlite3.Row) -> DecisionRecord:
        """Rebuild a record from payload JSON, overriding status with the authoritative column."""
        record = DecisionRecord.model_validate_json(row["payload"])
        record.status = row["status"]
        return record

    def update_status(self, decision_id: str, status: str) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE decisions SET status = ? WHERE decision_id = ?",
                (status, decision_id),
            )
            self._conn.commit()

    def close(self) -> None:
        self._conn.close()
