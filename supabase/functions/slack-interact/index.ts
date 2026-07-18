/**
 * slack-interact — interactivity endpoint (spec §15 workflow 4, ADR-0003).
 * Handles clarification button taps: records the labelled correction,
 * routes the capture, resumes the pipeline, and updates the Slack message.
 */

import { voiceInboxDb, transition } from "../_shared/db.ts";
import { verifySlackSignature } from "../_shared/slack.ts";

const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";
const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const db = voiceInboxDb();

async function handleRouteChoice(
  clarificationId: string,
  captureId: string,
  projectId: string,
  slackUserId: string,
  responseUrl: string,
): Promise<void> {
  const correlationId = crypto.randomUUID();

  const cl = await db
    .from("clarifications")
    .update({ status: "answered", responded_at: new Date().toISOString(), response_json: { optionId: `project:${projectId}`, slackUserId } })
    .eq("id", clarificationId)
    .eq("status", "pending") // idempotent: second tap does nothing
    .select("id");
  if (cl.error) throw cl.error;
  if ((cl.data?.length ?? 0) === 0) return;

  const proj = await db.from("projects").select("id, name").eq("id", projectId).single();
  if (proj.error) throw proj.error;

  await db.from("captures").update({ selected_project_id: projectId, route_confidence: 1, route_method: "user_clarification" }).eq("id", captureId);
  await transition(db, captureId, "awaiting_route", "routed", correlationId, { projectId, via: "clarification" });

  // labelled routing evidence for Stage F learning (§11)
  await db.from("audit_events").insert({
    aggregate_type: "capture", aggregate_id: captureId,
    event_type: "routing.correction", actor_type: "slack_user", actor_id: slackUserId,
    correlation_id: correlationId, payload_json: { chosenProjectId: projectId, clarificationId },
  });
  await db.from("outbox_events").insert({
    event_type: "capture.routed", aggregate_id: captureId,
    payload_json: { eventId: crypto.randomUUID(), eventType: "capture.routed", captureId, projectId, confidence: 1, method: "user_clarification", correlationId },
  });

  // replace the buttons with the outcome
  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replace_original: true, text: `📁 Filed to *${proj.data.name}* — thanks, that's remembered as routing evidence.` }),
  });

  // resume downstream processing at the dispatch stage
  await fetch(`${SUPABASE_URL}/functions/v1/dispatch-github`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pipeline-secret": PIPELINE_SECRET },
    body: JSON.stringify({ captureId }),
  }).catch((e) => console.error("resume failed", e));
}

async function handleApproval(
  clarificationId: string,
  captureId: string,
  decision: "run" | "store",
  slackUserId: string,
  responseUrl: string,
): Promise<void> {
  const cl = await db
    .from("clarifications")
    .update({ status: "answered", responded_at: new Date().toISOString(), response_json: { decision, slackUserId } })
    .eq("id", clarificationId)
    .eq("status", "pending")
    .select("id");
  if (cl.error) throw cl.error;
  if ((cl.data?.length ?? 0) === 0) return;

  await db.from("audit_events").insert({
    aggregate_type: "capture", aggregate_id: captureId,
    event_type: "execution.approval", actor_type: "slack_user", actor_id: slackUserId,
    correlation_id: crypto.randomUUID(), payload_json: { decision, clarificationId },
  });

  await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replace_original: true, text: decision === "run" ? "🚀 Approved — dispatching to Claude Code…" : "💾 Saved without execution." }),
  });

  await fetch(`${SUPABASE_URL}/functions/v1/dispatch-github`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pipeline-secret": PIPELINE_SECRET },
    body: JSON.stringify({ captureId, approved: decision === "run", forceStore: decision === "store" }),
  }).catch((e) => console.error("dispatch call failed", e));
}

Deno.serve(async (req) => {
  const body = await req.text();
  const ok = await verifySlackSignature(
    SIGNING_SECRET, body,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
  );
  if (!ok) return new Response("invalid signature", { status: 401 });

  const payload = JSON.parse(new URLSearchParams(body).get("payload") ?? "{}");
  if (payload.type === "block_actions") {
    const action = payload.actions?.[0];
    if (action?.action_id?.startsWith("project:")) {
      const projectId = action.action_id.slice("project:".length);
      const meta = JSON.parse(action.value ?? "{}");
      EdgeRuntime.waitUntil(
        handleRouteChoice(meta.clarificationId, meta.captureId, projectId, payload.user?.id ?? "unknown", payload.response_url)
          .catch((e) => console.error("interact failed", e)),
      );
    } else if (action?.action_id === "approve:run" || action?.action_id === "approve:store") {
      const meta = JSON.parse(action.value ?? "{}");
      EdgeRuntime.waitUntil(
        handleApproval(meta.clarificationId, meta.captureId, action.action_id === "approve:run" ? "run" : "store", payload.user?.id ?? "unknown", payload.response_url)
          .catch((e) => console.error("approval failed", e)),
      );
    }
  }
  return new Response(""); // Slack expects a fast 200
});
