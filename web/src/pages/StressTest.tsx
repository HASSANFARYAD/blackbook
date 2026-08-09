import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { CounterfactualAnalysis, DecisionRecord } from "../types";
import StatusChip from "../components/StatusChip";
import ScoreGauge from "../components/ScoreGauge";

const COMPONENT_LABELS: Record<string, string> = {
  opportunity: "Opportunity",
  rights_confidence: "Rights confidence",
  competition: "Competition",
  production_feasibility: "Feasibility",
};

export default function StressTest() {
  const { id } = useParams<{ id: string }>();
  const [record, setRecord] = useState<DecisionRecord | null>(null);
  const [analysis, setAnalysis] = useState<CounterfactualAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setRecord(null);
    setAnalysis(null);
    setError(null);
    Promise.all([api.decision(id), api.counterfactual(id)])
      .then(([rec, cf]) => {
        setRecord(rec);
        setAnalysis(cf);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!record || !analysis) return <p className="muted">Loading…</p>;

  const passFlips = analysis.scenarios.filter(
    (s) => s.projected_recommendation === "PASS"
  );

  return (
    <div className="page">
      <p className="crumbs">
        <Link to="/">Command Center</Link>
        <span> / </span>
        <span>Stress Test</span>
      </p>

      <section className="detail-head">
        <div>
          <h1>Counterfactual — {record.ip}</h1>
          <p className="muted">What would have to change for the recommendation to flip?</p>
        </div>
        <ScoreGauge score={record.score} recommendation={record.recommendation} />
      </section>

      {passFlips.length > 0 && (
        <section className="banner banner-flip">
          <strong>Minimum detected flip → PASS</strong>
          <p>
            The smallest plausible change that kills the recommendation:{" "}
            <code>{passFlips[0].change}</code> (score {passFlips[0].projected_score}).
          </p>
        </section>
      )}

      <section>
        <h2 className="section-title">Flip scenarios</h2>
        <p className="hint">
          Scenarios are run through the same deterministic scoring engine used for
          the original decision — no invented arithmetic.
        </p>
        <div className="scenario-list">
          {analysis.scenarios.map((s, i) => {
            const flipped = s.projected_recommendation !== record.recommendation;
            return (
              <article key={i} className={`scenario ${flipped ? "scenario-flip" : ""}`}>
                <div className="scenario-head">
                  <StatusChip rec={s.projected_recommendation} />
                  <span className="scenario-score">{s.projected_score}</span>
                </div>
                <h3>{s.change}</h3>
                <p className="muted">{s.explanation}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="section-title">Sensitivity</h2>
        <p className="hint">
          Impact on the total score of a 10-point worsening swing in each component.
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Score impact (−)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(analysis.sensitivity).map(([label, impact]) => (
              <tr key={label}>
                <td>{COMPONENT_LABELS[label] ?? label}</td>
                <td>{impact}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="actions">
        <Link className="btn" to={`/decisions/${id}`}>
          Evidence Graph
        </Link>
        <Link className="btn" to={`/decisions/${id}/timeline`}>
          Timeline
        </Link>
      </p>
    </div>
  );
}
