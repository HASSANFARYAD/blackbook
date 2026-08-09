import type { APIRequestContext } from "@playwright/test";
import type { DecisionRecord } from "../src/types";

export async function fetchDecisions(
  request: APIRequestContext
): Promise<DecisionRecord[]> {
  const res = await request.get("/api/decisions");
  return (await res.json()) as DecisionRecord[];
}

export async function decisionId(
  request: APIRequestContext,
  ip: string,
  recommendation?: string
): Promise<string> {
  const list = await fetchDecisions(request);
  const found = list.find(
    (d) => d.ip === ip && (!recommendation || d.recommendation === recommendation)
  );
  if (!found) {
    throw new Error(`no seeded decision for "${ip}" ${recommendation ?? ""}`);
  }
  return found.decision_id;
}
