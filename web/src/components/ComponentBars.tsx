import type { ComponentScores } from "../types";

const COMPONENTS: { key: keyof ComponentScores; label: string }[] = [
  { key: "opportunity", label: "Opportunity" },
  { key: "rights_confidence", label: "Rights confidence" },
  { key: "competition", label: "Competition" },
  { key: "production_feasibility", label: "Feasibility" },
];

function barColor(key: keyof ComponentScores, value: number): string {
  if (key === "competition") {
    return value >= 60 ? "#ef4444" : value >= 35 ? "#f59e0b" : "#22c55e";
  }
  return value >= 70 ? "#22c55e" : value >= 45 ? "#f59e0b" : "#ef4444";
}

export default function ComponentBars({
  scores,
}: {
  scores: ComponentScores;
}) {
  return (
    <div className="component-bars" data-testid="component-bars">
      {COMPONENTS.map(({ key, label }) => (
        <div key={key} className="component-row">
          <span className="component-label">{label}</span>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{ width: `${scores[key]}%`, background: barColor(key, scores[key]) }}
            />
          </div>
          <span className="component-value">{scores[key]}</span>
        </div>
      ))}
    </div>
  );
}
