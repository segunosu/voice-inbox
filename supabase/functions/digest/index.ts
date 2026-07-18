/**
 * digest — scheduled operations (pg_cron → here).
 *  mode "sweep":  every 15 min — resume retryable failures at the stage their
 *                 artefacts prove they reached, and nudge stuck routed captures.
 *  mode "digest": daily — one batched summary to the capture channel, so the
 *                 owner gets a single glance instead of ambient pings.
 */

import { voiceInboxDb } from "../_shared/db.ts";
import { slackApi } from "../_shared/slack.ts";

const PIPELINE_SECRET = Deno.env.get("PIPELINE_SECRET") ?? "";
const BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const db = voiceInboxDb();

async function call(fn: string, body: Record<string, unknown>): Promise<void> {
  await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-pipeline-secret": PIPELINE_SECRET },
    body: JSON.stringify(body),
  }).catch((e) => console.error(`${fn} call failed`, e));
}

async function sweep(): Promise<Record<string, number>> {
  const counts = { resumed: 0, dispatched: 0 };
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();

  const failed = (await db.from("captures").select("id").eq("status", "retryable_failure").lt("updated_at", cutoff).limit(20)).data ?? [];
  for (const c of failed) {
    const hasTranscript = !!(await db.from("transcripts").select("id").eq("capture_id", c.id).limit(1)).data?.length;
    const hasIntake = !!(await db.from("structured_intakes").select("id").eq("capture_id", c.id).limit(1)).data?.length;
    const routed = !!(await db.from("captures").select("selected_project_id").eq("id", c.id).single()).data?.selected_project_id;
    const resumeAt = routed ? "routed" : hasIntake ? "structured" : hasTranscript ? "transcribed" : "uploaded";
    await db.from("captures").update({ status: resumeAt }).eq("id", c.id);
    if (resumeAt === "routed") await call("dispatch-github", { captureId: c.id });
    else await call("process-capture", { captureId: c.id });
    counts.resumed++;
  }

  const stuckCutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const stuckRouted = (await db.from("captures").select("id").eq("status", "routed").lt("updated_at", stuckCutoff).limit(20)).data ?? [];
  for (const c of stuckRouted) {
    await call("dispatch-github", { captureId: c.id });
    counts.dispatched++;
  }
  return counts;
}

async function digest(): Promise<void> {
  const channel = (await db.from("settings").select("value").eq("key", "digest_channel").maybeSingle()).data?.value;
  if (!channel || !BOT_TOKEN) return;
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  const caps = (await db.from("captures").select("status, title, selected_project_id").gte("created_at", since)).data ?? [];
  const projects = (await db.from("projects").select("id, name")).data ?? [];
  const pname = (id: string | null) => projects.find((p) => p.id === id)?.name ?? "—";
  const pending = (await db.from("clarifications").select("id").eq("status", "pending")).data ?? [];
  const exportsDone = (await db.from("folder_exports").select("id").eq("status", "exported").gte("created_at", since)).data ?? [];
  const jobs = (await db.from("agent_jobs").select("status, github_issue_url").gte("created_at", since)).data ?? [];

  const byProject = new Map<string, number>();
  for (const c of caps) byProject.set(pname(c.selected_project_id), (byProject.get(pname(c.selected_project_id)) ?? 0) + 1);
  const lines = [
    `🗞️ *Voice Inbox daily digest* — ${caps.length} capture${caps.length === 1 ? "" : "s"} in the last 24h`,
    ...[...byProject.entries()].map(([p, n]) => `• ${p}: ${n}`),
    `📄 ${exportsDone.length} intake file${exportsDone.length === 1 ? "" : "s"} written to project folders`,
    `🤖 ${jobs.length} agent job${jobs.length === 1 ? "" : "s"}${jobs.length ? " — " + jobs.map((j) => j.github_issue_url ?? j.status).join(", ") : ""}`,
    pending.length ? `⏳ *${pending.length} question${pending.length === 1 ? "" : "s"} waiting for you*` : "✅ Nothing waiting on you.",
  ];
  await slackApi("chat.postMessage", BOT_TOKEN, { channel, text: lines.join("\n") });
}

Deno.serve(async (req) => {
  if (req.headers.get("x-pipeline-secret") !== PIPELINE_SECRET || !PIPELINE_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const { mode } = await req.json();
  if (mode === "sweep") {
    const counts = await sweep();
    return new Response(JSON.stringify(counts), { headers: { "Content-Type": "application/json" } });
  }
  if (mode === "digest") {
    await digest();
    return new Response("ok");
  }
  return new Response("unknown mode", { status: 400 });
});
