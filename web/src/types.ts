export interface ComponentScores {
  opportunity: number;
  competition: number;
  rights_confidence: number;
  production_feasibility: number;
}

export interface EvidenceNode {
  id: string;
  entity_type: string;
  label: string;
  properties: Record<string, unknown>;
  source: string;
  source_url?: string | null;
  source_title?: string | null;
  published_at?: string | null;
  observed_at: string;
  confidence: "high" | "medium" | "low";
  quote?: string | null;
}

export interface EvidenceEdge {
  source_id: string;
  target_id: string;
  relationship: string;
  source: string;
  source_url?: string | null;
  source_title?: string | null;
  published_at?: string | null;
  observed_at: string;
  confidence: "high" | "medium" | "low";
  quote?: string | null;
}

export interface EvidenceGraph {
  ip: string;
  nodes: EvidenceNode[];
  edges: EvidenceEdge[];
}

export interface ResearchStatus {
  search: boolean;
  extract: boolean;
  deep_task: boolean;
  monitor: boolean;
  completeness: number;
}

export type Recommendation = "PURSUE" | "WATCH" | "PASS" | "REASSESS";

export interface DecisionRecord {
  ip: string;
  recommendation: Recommendation;
  score: number;
  component_scores: ComponentScores;
  reasoning_summary: string;
  decision_id: string;
  evidence: EvidenceGraph;
  status: string;
  created_at: string;
  previous_decision_id?: string | null;
  monitor_id?: string | null;
  research?: ResearchStatus | null;
  consumed_event_ids: string[];
}

export interface DriftEvaluation {
  decision_id: string;
  drifted: boolean;
  new_events: string[];
  changed_factors: string[];
  impact: string;
  re_evaluate: boolean;
}

export interface WatchResult {
  decision_id: string;
  drifted: boolean;
  events_checked: number;
  evaluation?: DriftEvaluation | null;
  new_record?: DecisionRecord | null;
}

export interface CounterfactualScenario {
  change: string;
  projected_score: number;
  projected_recommendation: Recommendation;
  explanation: string;
}

export interface CounterfactualAnalysis {
  sensitivity: Record<string, number>;
  scenarios: CounterfactualScenario[];
}
