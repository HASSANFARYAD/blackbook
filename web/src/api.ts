import type {
  CounterfactualAnalysis,
  DecisionRecord,
  WatchResult,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // non-JSON error body; keep the status text
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  decisions: () => request<DecisionRecord[]>("/decisions"),
  decision: (id: string) => request<DecisionRecord>(`/decisions/${id}`),
  lineage: (id: string) => request<DecisionRecord[]>(`/decisions/${id}/lineage`),
  evaluate: (ip: string, createMonitor = false) =>
    request<DecisionRecord>("/evaluate", {
      method: "POST",
      body: JSON.stringify({ ip, create_monitor: createMonitor }),
    }),
  watch: (decision_id: string) =>
    request<WatchResult>("/watch", {
      method: "POST",
      body: JSON.stringify({ decision_id }),
    }),
  counterfactual: (decision_id: string) =>
    request<CounterfactualAnalysis>("/counterfactual", {
      method: "POST",
      body: JSON.stringify({ decision_id }),
    }),
};
