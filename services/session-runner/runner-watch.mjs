/**
 * Voice Inbox runner WATCH daemon — the always-on, low-latency worker.
 * Instead of a 5-minute Task Scheduler poll, this stays resident and invokes
 * the (tested) single-run runner every few seconds, so a voice instruction is
 * picked up and processed within ~1 minute end-to-end. Started at logon by a
 * scheduled task and kept alive (restart-on-exit).
 *
 * Reuses runner.mjs unchanged (one lease+process per invocation) so all the
 * provenance guard, session and Slack logic stays in one place.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { appendFileSync, existsSync, statSync, writeFileSync, rmSync } from "node:fs";

const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const RUNNER = join(HERE, "runner.mjs");
const NODE = process.execPath;
const LOG = join(HERE, "watch.log");
const HEARTBEAT = join(HERE, "watch.alive");
const POLL_MS = 5000;

function log(m) {
  try { appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch { /* ignore */ }
}

// Single instance: a 1-minute scheduled task launches this; if a daemon is
// already alive (heartbeat < 90s old) we exit immediately, so only one runs.
if (existsSync(HEARTBEAT) && Date.now() - statSync(HEARTBEAT).mtimeMs < 90_000) {
  process.exit(0);
}
writeFileSync(HEARTBEAT, String(process.pid));
process.on("exit", () => { try { rmSync(HEARTBEAT, { force: true }); } catch { /* ignore */ } });

log("watch daemon started");
// eslint-disable-next-line no-constant-condition
while (true) {
  writeFileSync(HEARTBEAT, String(process.pid)); // refresh liveness each cycle
  const r = spawnSync(NODE, [RUNNER], { stdio: "ignore", timeout: 12 * 60_000 });
  if (r.status !== 0 && r.status !== null) log(`runner exited ${r.status}`);
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS);
}
