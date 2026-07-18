import { z } from "zod";

/** Structured intake contract — spec §10. Version 1.0. */

export const CAPTURE_TYPES = [
  "idea",
  "meeting_note",
  "decision",
  "requirement",
  "bug_report",
  "research_request",
  "task",
  "status_update",
  "reference_note",
  "mixed",
] as const;

export const INTENTS = [
  "store_only",
  "summarise",
  "request_change",
  "investigate",
  "create_document",
  "update_documentation",
  "create_tasks",
  "ask_project_question",
  "mixed",
] as const;

export const EXECUTION_PREFERENCES = [
  "store_only",
  "analyse_only",
  "prepare_for_approval",
  "execute_if_safe",
  "explicit_execute",
] as const;

/** Project execution modes — spec §4.6. Default: approval_required. */
export const EXECUTION_MODES = [
  "capture_only",
  "analyse_only",
  "docs_auto",
  "branch_auto",
  "approval_required",
  "disabled",
] as const;

export const RISK_LEVELS = ["low", "medium", "high"] as const;

const confidence = z.number().min(0).max(1);

export const ExplicitProjectReferenceSchema = z.object({
  raw: z.string().min(1),
  normalised: z.string().min(1),
  confidence,
});

export const RequirementSchema = z.object({
  text: z.string().min(1),
  priority: z.enum(["must", "should", "could"]),
  sourceExcerpt: z.string().nullable(),
});

export const ActionSchema = z.object({
  text: z.string().min(1),
  suggestedOwner: z.enum(["coding_agent", "owner", "unassigned"]),
  dueDate: z.iso.date().nullable(),
});

export const EntitySchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
});

export const SensitiveDataSchema = z.object({
  detected: z.boolean(),
  categories: z.array(
    z.enum([
      "credentials",
      "financial_account",
      "personal_identifier",
      "health",
      "legal_confidential",
      "client_confidential",
    ]),
  ),
});

export const StructuredIntakeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    captureId: z.uuid(),
    language: z.string().min(2),
    explicitProjectReference: ExplicitProjectReferenceSchema.nullable(),
    captureType: z.enum(CAPTURE_TYPES),
    intent: z.enum(INTENTS),
    executionPreference: z.enum(EXECUTION_PREFERENCES),
    title: z.string().min(1).max(200),
    conciseSummary: z.string().min(1),
    cleanTranscript: z.string().min(1),
    decisions: z.array(z.string()),
    requirements: z.array(RequirementSchema),
    actions: z.array(ActionSchema),
    questions: z.array(z.string()),
    constraints: z.array(z.string()),
    entities: z.array(EntitySchema),
    risks: z.array(z.string()),
    sensitiveData: SensitiveDataSchema,
    requiresClarification: z.boolean(),
    clarificationReason: z.string().nullable(),
    suggestedAgentMode: z.enum(EXECUTION_MODES),
    confidence,
  })
  .strict();

export type StructuredIntake = z.infer<typeof StructuredIntakeSchema>;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type Intent = (typeof INTENTS)[number];
export type ExecutionPreference = (typeof EXECUTION_PREFERENCES)[number];
