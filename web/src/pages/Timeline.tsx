import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { DecisionRecord } from "../types";
import ErrorState from "../components/ErrorState";
import StatusChip from "../components/StatusChip";
import { errorMessage, formatDay, recColor } from "../format";

function eventNodes(record: DecisionRecord) {
  return record.evidence.nodes.filter((n) => n.entity_type === "event");
}

export default function Timeline() {
  const { id } = useParams<{ id: string }>();
  const [lineage, setLineage] = useState<DecisionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLineage([]);
    setError(null);
    api
      .lineage(id)
      .then(setLineage)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <ErrorState message={error} />;
  if (lineage.length === 0) return <p className="muted">Loading…</p>;

  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/">Command Center</Link>
        <span> / </span>
        <span>Timeline</span>
      </p>

      <section className="detail-head">
        <div>
          <h1>Decision Drift — {lineage[0].ip}</h1>
          <p className="muted">
            How the recommendation evolved as new evidence arrived. Each revision
            links back to the one that came before.
          </p>
        </div>
      </section>

      <div className="timeline">
        {[...lineage].reverse().map((rec, revIdx) => {
          const i = lineage.length - 1 - revIdx;
          const isCurrent = revIdx === 0;
          const isOldest = revIdx === lineage.length - 1;
          const seenIds = new Set(
            i > 0 ? eventNodes(lineage[i - 1]).map((n) => n.id) : []
          );
          const events = i > 0
            ? eventNodes(rec).filter((n) => !seenIds.has(n.id))
            : [];
          const color = recColor(rec.recommendation);
          return (
            <div key={rec.decision_id} className="tl-step">
              <div className="tl-rail">
                <span
                  className="tl-dot"
                  style={{ background: color, boxShadow: `0 0 12px ${color}` }}
                />
                {!isOldest && <span className="tl-line" />}
              </div>
              <div className="tl-body">
                {events.length > 0 && (
                  <div className="tl-events">
                    {events.map((ev, j) => (
                      <div key={j} className="tl-event">
                        <span className="tl-event-tag">NEW EVIDENCE</span>
                        {ev.source_title || ev.label}
                        <span className="muted"> · {formatDay(ev.published_at)}</span>
                      </div>
                    ))}
                    <div className="tl-event-arrow">▼</div>
                  </div>
                )}
                <article className={`tl-card ${isCurrent ? "tl-card-current" : ""}`}>
                  <div className="tl-card-head">
                    <StatusChip rec={rec.recommendation} />
                    <span className="tl-score" style={{ color }}>
                      {rec.score}
                    </span>
                    <span className="tl-date">{formatDay(rec.created_at)}</span>
                    {isCurrent && <span className="tag tag-current">CURRENT</span>}
                  </div>
                  <h2>
                    {rec.recommendation} · {rec.ip}
                  </h2>
                  <p className="muted">{rec.reasoning_summary}</p>
                  <p className="muted id-hint">{rec.decision_id}</p>
                </article>
              </div>
            </div>
          );
        })}
      </div>

      <p className="actions">
        <Link className="btn" to={`/decisions/${id}`}>
          Evidence Graph
        </Link>
        <Link className="btn" to={`/decisions/${id}/stress-test`}>
          Stress Test
        </Link>
      </p>
    </div>
  );
}
