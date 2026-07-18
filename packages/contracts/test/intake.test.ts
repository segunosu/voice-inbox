import { describe, expect, it } from "vitest";
import { StructuredIntakeSchema } from "../src/intake.js";
import { RoutingAdjudicationSchema, shouldAutoRoute } from "../src/routing.js";
import { CaptureUploadedEventSchema } from "../src/events.js";

const validIntake = {
  schemaVersion: "1.0",
  captureId: "3f0f4d0e-6f3a-4a3e-9b2e-0d3f2c1b4a5d",
  language: "en",
  explicitProjectReference: {
    raw: "Project Voice Inbox",
    normalised: "voice inbox",
    confidence: 0.99,
  },
  captureType: "idea",
  intent: "request_change",
  executionPreference: "execute_if_safe",
  title: "Add a Quick Settings recording tile",
  conciseSummary: "Add a quick way to start a capture.",
  cleanTranscript: "Project Voice Inbox. Add a quicker way to start recording.",
  decisions: [],
  requirements: [
    { text: "Provide a faster capture entry point.", priority: "should", sourceExcerpt: null },
  ],
  actions: [{ text: "Design and implement.", suggestedOwner: "coding_agent", dueDate: null }],
  questions: [],
  constraints: [],
  entities: [{ type: "product", name: "Voice Inbox" }],
  risks: [],
  sensitiveData: { detected: false, categories: [] },
  requiresClarification: false,
  clarificationReason: null,
  suggestedAgentMode: "branch_auto",
  confidence: 0.94,
} as const;

describe("structured intake contract (§10)", () => {
  it("accepts the spec's canonical example shape", () => {
    expect(StructuredIntakeSchema.parse(validIntake)).toBeTruthy();
  });

  it("rejects unknown fields (strict contract)", () => {
    expect(() =>
      StructuredIntakeSchema.parse({ ...validIntake, hallucinated: true }),
    ).toThrow();
  });

  it("rejects invalid enum values and out-of-range confidence", () => {
    expect(() =>
      StructuredIntakeSchema.parse({ ...validIntake, intent: "delete_everything" }),
    ).toThrow();
    expect(() => StructuredIntakeSchema.parse({ ...validIntake, confidence: 1.4 })).toThrow();
  });
});

describe("routing adjudication + threshold policy (§11)", () => {
  const policy = { routingThreshold: 0.9, ambiguityMargin: 0.1 };
  const adjudication = {
    selectedProjectId: "3f0f4d0e-6f3a-4a3e-9b2e-0d3f2c1b4a5d",
    confidence: 0.94,
    reason: "Explicitly names Voice Inbox.",
    evidence: ["Voice Inbox"],
    alternatives: [{ projectId: "6b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e", confidence: 0.31 }],
    requiresClarification: false,
  };

  it("auto-routes only when confidence and margin both clear", () => {
    expect(shouldAutoRoute(RoutingAdjudicationSchema.parse(adjudication), policy)).toBe(true);
    expect(
      shouldAutoRoute(
        RoutingAdjudicationSchema.parse({
          ...adjudication,
          alternatives: [{ ...adjudication.alternatives[0], confidence: 0.9 }],
        }),
        policy,
      ),
    ).toBe(false);
    expect(
      shouldAutoRoute(RoutingAdjudicationSchema.parse({ ...adjudication, confidence: 0.8 }), policy),
    ).toBe(false);
  });

  it("never auto-routes a null selection or an explicit ask", () => {
    expect(
      shouldAutoRoute(
        RoutingAdjudicationSchema.parse({ ...adjudication, selectedProjectId: null }),
        policy,
      ),
    ).toBe(false);
    expect(
      shouldAutoRoute(
        RoutingAdjudicationSchema.parse({ ...adjudication, requiresClarification: true }),
        policy,
      ),
    ).toBe(false);
  });
});

describe("event contracts (§14, Slack source)", () => {
  it("accepts a valid capture.uploaded event and rejects a tampered one", () => {
    const event = {
      eventId: "3f0f4d0e-6f3a-4a3e-9b2e-0d3f2c1b4a5d",
      eventType: "capture.uploaded",
      occurredAt: "2026-07-18T12:00:00+01:00",
      correlationId: "6b1c2d3e-4f5a-4b6c-8d7e-9f0a1b2c3d4e",
      captureId: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
      audioObjectKey: "captures/2026/07/abc.m4a",
      mimeType: "audio/mp4",
      sha256: "a".repeat(64),
      source: "slack",
      slackChannelId: "C0123456789",
      slackMessageTs: "1752842400.000100",
      slackUserId: "U0123456789",
      slackNativeTranscript: null,
    };
    expect(CaptureUploadedEventSchema.parse(event)).toBeTruthy();
    expect(() =>
      CaptureUploadedEventSchema.parse({ ...event, sha256: "not-a-hash" }),
    ).toThrow();
  });
});
