import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { DecisionRecord, EvidenceNode } from "../types";
import ErrorState from "../components/ErrorState";
import ScoreGauge from "../components/ScoreGauge";
import ComponentBars from "../components/ComponentBars";
import EvidenceGraphView from "../components/EvidenceGraphView";
import { errorMessage, formatDate, humanize, safeHref } from "../format";

export default function DecisionDetail() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<DecisionRecord | null>(null);
  const [selected, setSelected] = useState<EvidenceNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Escape dismisses the provenance panel; without it the panel could only ever
  // be swapped for another node's, never closed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!id) return;
    setRecord(null);
    setSelected(null);
    setError(null);
    api
      .decision(id)
      .then(setRecord)
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (error) return <ErrorState message={error} />;
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
        <aside className="evidence-panel" data-testid="evidence-panel" aria-label="Evidence detail">
          <div className="evidence-panel-head">
            <h2>Evidence — {selected.label}</h2>
            <button
              type="button"
              className="btn btn-icon"
              aria-label="Close evidence"
              onClick={() => setSelected(null)}
            >
              ×
            </button>
          </div>
          <dl>
            <dt>Entity</dt>
            <dd>{humanize(selected.entity_type)}</dd>
            <dt>Source</dt>
            <dd>
              {safeHref(selected.source_url) ? (
                <a
                  href={safeHref(selected.source_url)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selected.source_title || selected.source_url}
                </a>
              ) : (
                // Provenance is still shown, just not as a clickable link.
                selected.source_title || selected.source_url || selected.source || "—"
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
