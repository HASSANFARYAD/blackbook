import type { Recommendation } from "../types";
import { recColor } from "../format";

export default function StatusChip({
  rec,
  big = false,
}: {
  rec: Recommendation;
  big?: boolean;
}) {
  return (
    <span
      className={`chip ${big ? "chip-big" : ""}`}
      style={{ color: recColor(rec), borderColor: recColor(rec) }}
    >
      {rec}
    </span>
  );
}
