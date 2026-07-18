import { z } from "zod";

/** Routing adjudication response — spec §11 stage D. */
export const RoutingAdjudicationSchema = z
  .object({
    selectedProjectId: z.uuid().nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string().min(1),
    evidence: z.array(z.string()),
    alternatives: z.array(
      z.object({
        projectId: z.uuid(),
        confidence: z.number().min(0).max(1),
      }),
    ),
    requiresClarification: z.boolean(),
  })
  .strict();

export type RoutingAdjudication = z.infer<typeof RoutingAdjudicationSchema>;

export const ROUTE_METHODS = [
  "explicit_alias",
  "deterministic",
  "semantic_adjudication",
  "user_clarification",
  "manual",
] as const;

/** Threshold policy — spec §11 stage E. All values configurable per project. */
export interface ThresholdPolicy {
  routingThreshold: number; // default 0.88 (projects table)
  ambiguityMargin: number; // default 0.08
}

export function shouldAutoRoute(
  adjudication: RoutingAdjudication,
  policy: ThresholdPolicy,
): boolean {
  if (adjudication.requiresClarification) return false;
  if (adjudication.selectedProjectId === null) return false;
  if (adjudication.confidence < policy.routingThreshold) return false;
  const runnerUp = adjudication.alternatives[0]?.confidence ?? 0;
  return adjudication.confidence - runnerUp >= policy.ambiguityMargin;
}
