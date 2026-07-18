/**
 * Capture state machine — spec §8, amended by ADR-0003:
 * Slack owns recording/upload, so the pipeline starts at `uploaded`.
 */

export const CAPTURE_STATUSES = [
  "uploaded",
  "transcribing",
  "transcribed",
  "structuring",
  "structured",
  "routing",
  "awaiting_route",
  "routed",
  "awaiting_action_approval",
  "preparing_intake",
  "intake_ready",
  "agent_queued",
  "agent_running",
  "agent_completed",
  "agent_failed",
  "completed",
  "retryable_failure",
  "terminal_failure",
  "cancelled",
] as const;

export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];

/** States in which automated work is in flight (spec §8: "any processing state"). */
export const PROCESSING_STATES = [
  "transcribing",
  "structuring",
  "routing",
  "preparing_intake",
  "agent_queued",
  "agent_running",
] as const satisfies readonly CaptureStatus[];

/** States waiting on a human answer. */
export const WAITING_STATES = [
  "awaiting_route",
  "awaiting_action_approval",
] as const satisfies readonly CaptureStatus[];

/** No transitions out. A terminal failure preserves all prior artefacts (spec §8). */
export const TERMINAL_STATES = [
  "completed",
  "terminal_failure",
  "cancelled",
] as const satisfies readonly CaptureStatus[];

const NORMAL_TRANSITIONS: Record<CaptureStatus, readonly CaptureStatus[]> = {
  uploaded: ["transcribing"],
  transcribing: ["transcribed"],
  transcribed: ["structuring"],
  structuring: ["structured"],
  structured: ["routing"],
  routing: ["awaiting_route", "routed"],
  awaiting_route: ["routed"],
  routed: ["awaiting_action_approval", "preparing_intake"],
  awaiting_action_approval: ["preparing_intake"],
  preparing_intake: ["intake_ready"],
  // store-only / reference intents finish without an agent job
  intake_ready: ["agent_queued", "completed"],
  agent_queued: ["agent_running"],
  agent_running: ["agent_completed", "agent_failed"],
  agent_completed: ["completed"],
  // failed runs may be retried, accepted as final, or escalated
  agent_failed: ["agent_queued", "completed", "terminal_failure"],
  completed: [],
  // a retryable failure resumes at the processing state that failed
  retryable_failure: [...PROCESSING_STATES, "terminal_failure", "cancelled"],
  terminal_failure: [],
  cancelled: [],
};

function isProcessing(s: CaptureStatus): boolean {
  return (PROCESSING_STATES as readonly CaptureStatus[]).includes(s);
}

function isWaiting(s: CaptureStatus): boolean {
  return (WAITING_STATES as readonly CaptureStatus[]).includes(s);
}

export function allowedTransitions(from: CaptureStatus): readonly CaptureStatus[] {
  const extra: CaptureStatus[] = [];
  if (isProcessing(from)) extra.push("retryable_failure", "terminal_failure", "cancelled");
  if (isWaiting(from)) extra.push("cancelled");
  return [...NORMAL_TRANSITIONS[from], ...extra];
}

export function canTransition(from: CaptureStatus, to: CaptureStatus): boolean {
  return allowedTransitions(from).includes(to);
}

/**
 * Walks a capture through a sequence of states, throwing on the first
 * invalid transition. Used by the Phase 0 exit-gate simulation and, later,
 * by the API's transition guard.
 */
export function assertPath(path: readonly CaptureStatus[]): void {
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1]!;
    const to = path[i]!;
    if (!canTransition(from, to)) {
      throw new Error(`Invalid capture transition: ${from} -> ${to}`);
    }
  }
}
