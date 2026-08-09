"""Seed a realistic decision dataset into BLACKBOOK's store (no API keys needed).

Usage:
    python scripts/seed_demo.py [--db path/to/blackbook.db]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from app.demo_seed import seed
from agent.store import DecisionStore


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="blackbook.db", help="Path to the SQLite database")
    args = parser.parse_args()

    db_path = Path(args.db)
    try:
        db_path.unlink()
    except OSError:
        # DB may be open by a running server; seeding is still safe (upsert).
        pass

    store = DecisionStore(args.db)
    seed(store)
    store.close()
    print(f"Seeded BLACKBOOK demo data into {args.db}")


if __name__ == "__main__":
    main()
