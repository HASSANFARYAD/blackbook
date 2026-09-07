import { Link } from "react-router-dom";
import type { DecisionRecord } from "../types";
import { formatDate } from "../format";
import ScoreGauge from "./ScoreGauge";
import ComponentBars from "./ComponentBars";

export default function DecisionCard({
  record,
  onWatch,
  watchBusy,
  anyWatchBusy,
}: {
  record: DecisionRecord;
  onWatch: (id: string) => void;
  /** This card's watch is the one in flight. */
  watchBusy: boolean;
  /** Some card's watch is in flight; only one runs at a time. */
  anyWatchBusy: boolean;
}) {
  const id = record.decision_id;
  return (
    <article className="card">
      <div className="card-head">
        <h2>{record.ip}</h2>
        <div className="card-meta">
          {record.status !== "active" && (
            <span className="tag">{record.status.replace(/_/g, " ")}</span>
          )}
          <span className="muted">{formatDate(record.created_at)}</span>
        </div>
      </div>
      <div className="card-body">
        <ScoreGauge score={record.score} recommendation={record.recommendation} />
        <ComponentBars scores={record.component_scores} />
      </div>
      <div className="card-actions">
        <Link className="btn" to={`/decisions/${id}`}>
          Evidence
        </Link>
        <Link className="btn" to={`/decisions/${id}/stress-test`}>
          Stress Test
        </Link>
        <Link className="btn" to={`/decisions/${id}/timeline`}>
          Timeline
        </Link>
        <button
          className="btn btn-primary"
          // Disabled for every card, not just the busy one: the handler already
          // refuses concurrent watches, so leaving the others enabled only
          // offered clicks that silently did nothing.
          disabled={anyWatchBusy}
          onClick={() => onWatch(id)}
        >
          {watchBusy ? "Checking…" : "Watch"}
        </button>
      </div>
    </article>
  );
}
