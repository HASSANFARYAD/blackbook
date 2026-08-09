import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { DecisionRecord, EvidenceNode } from "../types";
import ScoreGauge from "../components/ScoreGauge";
import ComponentBars from "../components/ComponentBars";
import EvidenceGraphView from "../components/EvidenceGraphView";
import { formatDate, humanize } from "../format";

export default function DecisionDetail() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<DecisionRecord | null>(null);
  const [selected, setSelected] = useState<EvidenceNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setRecord(null);
    setSelected(null);
    setError(null);
    api
      .decision(id)
      .then(setRecord)
      .catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!record) return <p className="muted">Loading…</p>;

  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/">Command Center</Link>
        <span> / </span>
        <span>Evidence Graph</span>
      </p>

      <section className="detail-head">
        <div>
          <h1>{record.ip}</h1>
          <p className="muted">{record.decision_id} · {formatDate(record.created_at)}</p>
        </div>
        <ScoreGauge score={record.score} recommendation={record.recommendation} />
        <ComponentBars scores={record.component_scores} />
      </section>

      <p className="hint">
        Click a node to inspect its evidence. Every claim carries a source, a
        publication date, and a confidence.
      </p>

      <EvidenceGraphView
        graph={record.evidence}
        selectedId={selected?.id}
        onSelect={setSelected}
      />

      {selected && (
        <aside className="evidence-panel">
          <h3>Evidence — {selected.label}</h3>
          <dl>
            <dt>Entity</dt>
            <dd>{humanize(selected.entity_type)}</dd>
            <dt>Source</dt>
            <dd>
              {selected.source_url ? (
                <a href={selected.source_url} target="_blank" rel="noreferrer">
                  {selected.source_title || selected.source_url}
                </a>
              ) : (
                selected.source || "—"
              )}
            </dd>
            <dt>Published</dt>
            <dd>{formatDate(selected.published_at)}</dd>
            <dt>Observed</dt>
            <dd>{formatDate(selected.observed_at)}</dd>
            <dt>Confidence</dt>
            <dd>
              <span className={`dot ${selected.confidence}`} /> {selected.confidence}
            </dd>
            {selected.quote && (
              <>
                <dt>Excerpt</dt>
                <dd className="quote">“{selected.quote}”</dd>
              </>
            )}
          </dl>
        </aside>
      )}

      <p className="actions">
        <Link className="btn" to={`/decisions/${id}/stress-test`}>
          Stress Test
        </Link>
        <Link className="btn" to={`/decisions/${id}/timeline`}>
          Timeline
        </Link>
      </p>
    </div>
  );
}
