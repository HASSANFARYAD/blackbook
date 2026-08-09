import type { Recommendation } from "../types";
import { recColor } from "../format";

export default function ScoreGauge({
  score,
  recommendation,
}: {
  score: number;
  recommendation: Recommendation;
}) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const color = recColor(recommendation);
  return (
    <div className="gauge">
      <svg viewBox="0 0 128 128" width="128" height="128" aria-hidden>
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 64 64)"
        />
      </svg>
      <div className="gauge-center">
        <div className="gauge-score" style={{ color }}>
          {score}
        </div>
        <div className="gauge-rec">{recommendation}</div>
      </div>
    </div>
  );
}
