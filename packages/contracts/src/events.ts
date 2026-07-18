import { z } from "zod";

/** Event contracts — spec §14, capture source amended by ADR-0003 (Slack). */

const base = {
  eventId: z.uuid(),
  occurredAt: z.iso.datetime({ offset: true }),
  correlationId: z.uuid(),
};

export const CaptureUploadedEventSchema = z
  .object({
    ...base,
    eventType: z.literal("capture.uploaded"),
    captureId: z.uuid(),
    audioObjectKey: z.string().min(1),
    mimeType: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    source: z.literal("slack"),
    slackChannelId: z.string().min(1),
    slackMessageTs: z.string().min(1),
    slackUserId: z.string().min(1),
    /** Slack's own clip transcript, when the API exposes it (free fast-path). */
    slackNativeTranscript: z.string().nullable(),
  })
  .strict();

export const TranscriptionCompletedEventSchema = z
  .object({
    ...base,
    eventType: z.literal("transcription.completed"),
    captureId: z.uuid(),
    transcriptId: z.uuid(),
    language: z.string().min(2),
    transcriptVersion: z.number().int().positive(),
  })
  .strict();

export const IntakeStructuredEventSchema = z
  .object({
    ...base,
    eventType: z.literal("intake.structured"),
    captureId: z.uuid(),
    structuredIntakeId: z.uuid(),
  })
  .strict();

export const CaptureRoutedEventSchema = z
  .object({
    ...base,
    eventType: z.literal("capture.routed"),
    captureId: z.uuid(),
    projectId: z.uuid(),
    confidence: z.number().min(0).max(1),
    method: z.enum([
      "explicit_alias",
      "deterministic",
      "semantic_adjudication",
      "user_clarification",
      "manual",
    ]),
  })
  .strict();

export const AgentJobRequestedEventSchema = z
  .object({
    ...base,
    eventType: z.literal("agent.job_requested"),
    agentJobId: z.uuid(),
    captureId: z.uuid(),
    projectId: z.uuid(),
    requestedMode: z.enum([
      "capture_only",
      "analyse_only",
      "docs_auto",
      "branch_auto",
      "approval_required",
      "disabled",
    ]),
  })
  .strict();

export const ClarificationAnsweredEventSchema = z
  .object({
    ...base,
    eventType: z.literal("clarification.answered"),
    clarificationId: z.uuid(),
    captureId: z.uuid(),
    optionId: z.string().min(1),
    respondedBySlackUserId: z.string().min(1),
  })
  .strict();

export const OutboxEventSchema = z.discriminatedUnion("eventType", [
  CaptureUploadedEventSchema,
  TranscriptionCompletedEventSchema,
  IntakeStructuredEventSchema,
  CaptureRoutedEventSchema,
  AgentJobRequestedEventSchema,
  ClarificationAnsweredEventSchema,
]);

export type OutboxEvent = z.infer<typeof OutboxEventSchema>;
