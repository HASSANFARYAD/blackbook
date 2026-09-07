import { useMemo } from "react";
import type { EvidenceGraph, EvidenceNode } from "../types";
import { humanize } from "../format";

const COL_ORDER = [
  "ip",
  "rights_holder",
  "territory",
  "adaptation",
  "competitor",
  "talent",
  "event",
  "other",
];

const COL_W = 230;
const GAP_X = 64;
const CARD_H = 92;
const GAP_Y = 26;
const PAD = 28;

interface Position {
  x: number;
  y: number;
  cx: number;
  cy: number;
}

export default function EvidenceGraphView({
  graph,
  selectedId,
  onSelect,
}: {
  graph: EvidenceGraph;
  selectedId?: string | null;
  onSelect: (node: EvidenceNode) => void;
}) {
  const { positions, width, height } = useMemo(() => {
    const cols = new Map<string, EvidenceNode[]>();
    for (const node of graph.nodes) {
      const key = COL_ORDER.includes(node.entity_type)
        ? node.entity_type
        : "other";
      const list = cols.get(key) ?? [];
      list.push(node);
      cols.set(key, list);
    }
    const keys = [...cols.keys()].sort(
      (a, b) => COL_ORDER.indexOf(a) - COL_ORDER.indexOf(b)
    );

    const pos = new Map<string, Position>();
    keys.forEach((col, i) => {
      const x = PAD + i * (COL_W + GAP_X);
      cols.get(col)!.forEach((node, j) => {
        const y = PAD + j * (CARD_H + GAP_Y);
        pos.set(node.id, { x, y, cx: x + COL_W / 2, cy: y + CARD_H / 2 });
      });
    });

    const nCols = Math.max(1, keys.length);
    const heights: number[] = keys.map((k) => (cols.get(k) ?? []).length);
    const nRows = Math.max(1, ...heights);
    const width = PAD * 2 + nCols * COL_W + (nCols - 1) * GAP_X;
    const height = PAD * 2 + nRows * CARD_H + (nRows - 1) * GAP_Y;
    return { positions: pos, width, height };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="graph-wrap">
        <p className="graph-empty">
          No evidence recorded for this decision yet. Evidence nodes appear here
          once research or a drift check has run.
        </p>
      </div>
    );
  }

  return (
    // The scroll container is sized by the layout; only the inner canvas takes
    // the computed graph width, so a wide graph pans inside its own box instead
    // of forcing the whole document to scroll sideways.
    <div className="graph-wrap" data-testid="evidence-graph">
      <div className="graph-canvas" style={{ width, height }}>
      <svg
        className="graph-svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148,163,184,0.6)" />
          </marker>
        </defs>
        {graph.edges.map((edge, i) => {
          const s = positions.get(edge.source_id);
          const t = positions.get(edge.target_id);
          if (!s || !t) return null;
          return (
            <line
              key={i}
              x1={s.cx}
              y1={s.cy}
              x2={t.cx}
              y2={t.cy}
              stroke="rgba(148,163,184,0.55)"
              strokeWidth="1.5"
              markerEnd="url(#arrow)"
            />
          );
        })}
      </svg>
      {graph.nodes.map((node) => {
        const p = positions.get(node.id);
        if (!p) return null;
        const selected = node.id === selectedId;
        return (
          <button
            key={node.id}
            className={`g-node ${selected ? "g-node-selected" : ""}`}
            style={{
              left: p.x,
              top: p.y,
              width: COL_W,
              height: CARD_H,
            }}
            onClick={() => onSelect(node)}
            title={`${node.label} — ${humanize(node.entity_type)}`}
          >
            <span className="g-node-label">{node.label}</span>
            <span className="g-node-type">
              {humanize(node.entity_type)}
              <span className={`dot ${node.confidence}`} />
            </span>
          </button>
        );
      })}
      </div>
    </div>
  );
}
