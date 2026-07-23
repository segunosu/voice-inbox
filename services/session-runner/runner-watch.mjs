/**
 * Voice Inbox runner WATCH daemon — the always-on, low-latency worker.
 * Instead of a 5-minute Task Scheduler poll, this stays resident and invokes
 * the (tested) single-run runner every few seconds, so a voice instruction is
 * picked up and processed within ~1 minute end-to-end. Started at logon by a
 * scheduled task and kept alive (restart-on-exit).
 *
 * Reuses runner.mjs unchanged (one lease+process per invocation) so all the
 * provenance guard, session and Slack logic stays in one place.
 *
 * ALSO runs a self-healing sweep (~every 60s): the pipeline must never stall
 * silently. A job stuck in `running` (crash between lease and completion, or a
 * hang) is requeued so the runner retries it; one that has exhausted its
 * retries is failed and the user is told in Slack; a capture stalled at routing
 * is nudged once. This is what turns the flaky Node-24 teardown crash into a
 * non-event instead of a "still processing 30 minutes later".
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { appendFileSync, existsSync, statSync, writeFileSync, rmSync, readFileSync } from "node:fs";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const RUNNER = join(HERE, "runner.mjs");
const NODE = process.execPath;
const LOG = join(HERE, "watch.log");
const HEARTBEAT = join(HERE, "watch.alive");
const POLL_MS = 5000;
const SWEEP_EVERY_MS = 60_000;
const RUNNING_STALL_MS = 8 * 60_000;   // a job running longer than this is stuck
const ROUTE_STALL_MS = 5 * 60_000;     // a capture unrouted longer than this is stuck
const MAX_ATTEMPTS = 3;

function log(m) {
  try { appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch { /* ignore */ }
}

// --- config for the sweep (same secrets file the runner uses) -------------
const ENV_PATH = "C:/Users/Oem/.secrets/voice-inbox.env";
let BASE = "", KEY = "", BOT = "", H = {};
try {
  const env = Object.fromEntries(
    readFileSync(ENV_PATH, "utf8").split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  BASE = env.SUPABASE_URL; KEY = env.SUPABASE_SERVICE_ROLE_KEY; BOT = env.SLACK_BOT_TOKEN;
  H = {
    apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json",
    "Accept-Profile": "voice_inbox", "Content-Profile": "voice_inbox", Prefer: "return=representation",
  };
} catch (e) { log(`sweep config load failed (sweep disabled): ${e}`); }

async function slackReply(channel, threadTs, text) {
  if (!BOT || !channel) return;
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${BOT}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, thread_ts: threadTs, text }),
  }).catch((e) => log(`sweep slack failed: ${e}`));
}

async function sweepStuck() {
  if (!BASE || !KEY) return;
  // 1) jobs stuck in `running` past the stall window
  const cut = new Date(Date.now() - RUNNING_STALL_MS).toISOString();
  const stuckRes = await fetch(`${BASE}/rest/v1/agent_jobs?status=eq.running&started_at=lt.${cut}&select=id,capture_id,attempt_count,started_at`, { headers: H });
  const stuck = stuckRes.ok ? await stuckRes.json() : [];
  for (const job of stuck) {
    const capRes = await fetch(`${BASE}/rest/v1/captures?id=eq.${job.capture_id}&select=slack_channel_id,slack_message_ts,title`, { headers: H });
    const cap = (capRes.ok ? await capRes.json() : [])[0] || {};
    if ((job.attempt_count ?? 0) >= MAX_ATTEMPTS) {
      await fetch(`${BASE}/rest/v1/agent_jobs?id=eq.${job.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "failed", result_summary: "stalled and swept after max attempts", completed_at: new Date().toISOString() }) });
      await fetch(`${BASE}/rest/v1/captures?id=eq.${job.capture_id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "agent_failed" }) });
      await slackReply(cap.slack_channel_id, cap.slack_message_ts, `⚠️ Sorry — *${cap.title || "your request"}* stalled and couldn't finish after ${MAX_ATTEMPTS} tries. Send it again when you're ready and I'll pick it straight up.`);
      log(`sweep: job ${job.id} failed (max attempts)`);
    } else {
      await fetch(`${BASE}/rest/v1/agent_jobs?id=eq.${job.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "queued", started_at: null }) });
      log(`sweep: job ${job.id} requeued (attempt ${job.attempt_count ?? 0})`);
    }
  }
  // 2) captures stalled at routing — nudge once (marker: route_method='nudged')
  const rcut = new Date(Date.now() - ROUTE_STALL_MS).toISOString();
  const unrRes = await fetch(`${BASE}/rest/v1/captures?status=eq.awaiting_route&route_method=is.null&updated_at=lt.${rcut}&select=id,slack_channel_id,slack_message_ts,title`, { headers: H });
  const unrouted = unrRes.ok ? await unrRes.json() : [];
  for (const cap of unrouted) {
    await slackReply(cap.slack_channel_id, cap.slack_message_ts, `❓ *${cap.title || "That note"}* is waiting to be routed — tap a project from the buttons above, or reply in this thread with the project name and I'll run it.`);
    await fetch(`${BASE}/rest/v1/captures?id=eq.${cap.id}`, { method: "PATCH", headers: H, body: JSON.stringify({ route_method: "nudged" }) });
    log(`sweep: capture ${cap.id} route-nudged`);
  }
}

// Single instance: a 1-minute scheduled task launches this; if a daemon is
// already alive (heartbeat < 90s old) we exit immediately, so only one runs.
if (existsSync(HEARTBEAT) && Date.now() - statSync(HEARTBEAT).mtimeMs < 90_000) {
  process.exit(0);
}
writeFileSync(HEARTBEAT, String(process.pid));
process.on("exit", () => { try { rmSync(HEARTBEAT, { force: true }); } catch { /* ignore */ } });

log("watch daemon started");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastSweep = 0;
// eslint-disable-next-line no-constant-condition
while (true) {
  writeFileSync(HEARTBEAT, String(process.pid)); // refresh liveness each cycle
  const r = spawnSync(NODE, [RUNNER], { stdio: "ignore", timeout: 12 * 60_000 });
  if (r.status !== 0 && r.status !== null) log(`runner exited ${r.status}`);
  if (Date.now() - lastSweep >= SWEEP_EVERY_MS) {
    lastSweep = Date.now();
    try { await sweepStuck(); } catch (e) { log(`sweep error (ignored): ${e}`); }
  }
  await sleep(POLL_MS);
}
