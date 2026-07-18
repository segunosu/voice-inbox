import { describe, expect, it } from "vitest";
import {
  PROCESSING_STATES,
  TERMINAL_STATES,
  allowedTransitions,
  assertPath,
  canTransition,
} from "../src/states.js";

describe("capture state machine (§8, ADR-0003)", () => {
  it("a fake capture traverses the full agent path uploaded → completed", () => {
    assertPath([
      "uploaded",
      "transcribing",
      "transcribed",
      "structuring",
      "structured",
      "routing",
      "routed",
      "preparing_intake",
      "intake_ready",
      "agent_queued",
      "agent_running",
      "agent_completed",
      "completed",
    ]);
  });

  it("ambiguous routing detours through awaiting_route after clarification", () => {
    assertPath(["structured", "routing", "awaiting_route", "routed", "preparing_intake"]);
  });

  it("approval_required detours through awaiting_action_approval", () => {
    assertPath(["routed", "awaiting_action_approval", "preparing_intake", "intake_ready"]);
  });

  it("store-only captures complete without an agent job", () => {
    assertPath(["preparing_intake", "intake_ready", "completed"]);
  });

  it("failed agent runs can retry without duplicating the intake path", () => {
    assertPath(["agent_running", "agent_failed", "agent_queued", "agent_running", "agent_completed"]);
  });

  it("rejects skipping stages", () => {
    expect(() => assertPath(["uploaded", "routing"])).toThrow(/Invalid capture transition/);
    expect(canTransition("uploaded", "completed")).toBe(false);
    expect(canTransition("transcribed", "routed")).toBe(false);
  });

  it("every processing state may fail retryably or terminally, or be cancelled", () => {
    for (const s of PROCESSING_STATES) {
      expect(canTransition(s, "retryable_failure"), s).toBe(true);
      expect(canTransition(s, "terminal_failure"), s).toBe(true);
      expect(canTransition(s, "cancelled"), s).toBe(true);
    }
  });

  it("retryable_failure resumes at a processing state, never a terminal one", () => {
    expect(canTransition("retryable_failure", "transcribing")).toBe(true);
    expect(canTransition("retryable_failure", "agent_queued")).toBe(true);
    expect(canTransition("retryable_failure", "completed")).toBe(false);
  });

  it("terminal states have no exits", () => {
    for (const s of TERMINAL_STATES) {
      expect(allowedTransitions(s), s).toHaveLength(0);
    }
  });
});
