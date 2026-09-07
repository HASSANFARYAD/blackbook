import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import type { DecisionRecord } from "../types";
import DecisionCard from "../components/DecisionCard";

export default function CommandCenter() {
  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);
  const [watchBusyId, setWatchBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setDecisions(await api.decisions());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const evaluate = async (e: FormEvent) => {
    e.preventDefault();
    if (!ip.trim() || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const rec = await api.evaluate(ip.trim(), true);
      setNotice(
        `"${rec.ip}" evaluated → ${rec.recommendation} · score ${rec.score}. A Parallel monitor is watching for new events.`
      );
      setIp("");
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  const watch = async (decisionId: string) => {
    if (watchBusyId) return;
    setWatchBusyId(decisionId);
    setError(null);
    setNotice(null);
    try {
      const result = await api.watch(decisionId);
      if (result.drifted && result.new_record) {
        setNotice(
          `Drift detected — a linked revision was created: ${result.new_record.recommendation} · score ${result.new_record.score}.`
        );
      } else {
        setNotice(
          `No material drift. ${result.events_checked} new event(s) checked against the decision.`
        );
      }
      await refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setWatchBusyId(null);
    }
  };

  return (
    <div className="page">
      <section className="hero">
        <h1>Decision Command Center</h1>
        <p>
          Research an IP. Make a decision. Remember why. Detect when the decision
          should change.
        </p>
        <form className="evaluate-form" onSubmit={evaluate}>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="Enter an IP to evaluate, e.g. The Expanse"
            aria-label="IP to evaluate"
          />
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Researching…" : "Evaluate"}
          </button>
        </form>
        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section>
        <h2 className="section-title">Decisions</h2>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : decisions.length === 0 ? (
          <p className="muted">
            No decisions yet. Evaluate an IP above to create the first one.
          </p>
        ) : (
          <div className="grid">
            {decisions.map((d) => (
              <DecisionCard
                key={d.decision_id}
                record={d}
                onWatch={watch}
                watchBusy={watchBusyId === d.decision_id}
                anyWatchBusy={watchBusyId !== null}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
