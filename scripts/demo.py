"""Run a full BLACKBOOK evaluation from the CLI.

Usage:
    python scripts/demo.py "The Expanse" [--watch] [--counterfactual]

Requires GOOGLE_API_KEY and PARALLEL_API_KEY in .env.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from agent.pipeline import Blackbook


def main() -> None:
    parser = argparse.ArgumentParser(description="BLACKBOOK evaluation demo")
    parser.add_argument("ip", nargs="?", default="The Expanse", help="IP to evaluate")
    parser.add_argument("--watch", action="store_true", help="create a monitor and check drift")
    parser.add_argument("--counterfactual", action="store_true", help="run the decision simulator")
    args = parser.parse_args()

    bb = Blackbook()
    record = bb.evaluate_ip(args.ip, create_monitor=args.watch)

    print("\n" + "=" * 60)
    print(f"BLACKBOOK DECISION: {record.recommendation.value} -- {record.score}/100")
    print("=" * 60)
    print(f"decision_id: {record.decision_id}")
    print(f"ip:          {record.ip}")
    print(f"opportunity: {record.component_scores.opportunity}")
    print(f"competition: {record.component_scores.competition}")
    print(f"rights:      {record.component_scores.rights_confidence}")
    print(f"feasibility: {record.component_scores.production_feasibility}")
    print(f"reasoning:   {record.reasoning_summary}")
    print(f"evidence:    {len(record.evidence.nodes)} nodes, {len(record.evidence.edges)} edges")
    if record.research:
        status = record.research
        print(
            f"research:    search={'OK' if status.search else 'FAIL'} "
            f"extract={'OK' if status.extract else 'FAIL'} "
            f"deep_task={'OK' if status.deep_task else 'UNAVAILABLE'} "
            f"monitor={'OK' if status.monitor else 'SKIPPED'} "
            f"| completeness {int(status.completeness * 100)}%"
        )
    if record.monitor_id:
        print(f"monitor_id:  {record.monitor_id}")

    if args.watch:
        print("\nChecking for drift...")
        result = bb.watch_decision(record.decision_id)
        if result.drifted:
            print(f"DRIFT DETECTED: {result.evaluation.impact}")
            if result.new_record:
                print(
                    f"RE-EVALUATED: {result.new_record.recommendation.value} -- "
                    f"{result.new_record.score}/100 (new decision_id {result.new_record.decision_id})"
                )
        else:
            print(f"No material drift ({result.events_checked} events checked).")
        print("\nDecision timeline:")
        for node in bb.lineage(record.decision_id):
            marker = "DRIFT -> " if node.status == "drift_re_evaluated" else ""
            print(
                f"  {node.created_at.strftime('%b %d')}  {marker}{node.recommendation.value} -- "
                f"{node.score}/100  ({node.decision_id})"
            )

    if args.counterfactual:
        print("\nDecision sensitivity:")
        analysis = bb.counterfactual(record.decision_id)
        for factor, importance in analysis.sensitivity.items():
            print(f"  {factor}: {'#' * (importance // 10)}{'.' * (10 - importance // 10)}")
        for scenario in analysis.scenarios:
            print(
                f"  -> {scenario.change}: score would move to {scenario.projected_score} "
                f"({scenario.projected_recommendation.value}) - {scenario.explanation}"
            )


if __name__ == "__main__":
    main()
