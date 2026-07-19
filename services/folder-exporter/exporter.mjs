/**
 * Voice Inbox folder exporter — runs on the always-on PC every 5 minutes
 * (Windows Task Scheduler). Pulls pending folder_exports from Supabase and
 * writes each intake as a §12-style markdown file inside the matching
 * Drive-synced Cowork project folder; Google Drive for Desktop syncs it up.
 *
 * Config: C:\Users\Oem\.secrets\voice-inbox.env  (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COWORK_ROOT)
 * No dependencies — Node 20+ built-ins only.
 */

import { readFileSync, mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const ENV_PATH = "C:/Users/Oem/.secrets/voice-inbox.env";
const LOG_PATH = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "exporter.log");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { appendFileSync(LOG_PATH, line); } catch { /* ignore */ }
  console.log(line.trim());
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const BASE = env.SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const ROOT = env.COWORK_ROOT || "E:/Claude Coworker - Drive E/Claude Cowork";
if (!BASE || !KEY) { log("missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  "Accept-Profile": "voice_inbox",
  "Content-Profile": "voice_inbox",
};

const res = await fetch(`${BASE}/rest/v1/folder_exports?status=eq.pending&select=id,folder_path,filename,markdown,created_at&limit=25`, { headers });
if (!res.ok) { log(`fetch pending failed: HTTP ${res.status} ${await res.text()}`); process.exit(1); }
const pending = await res.json();

for (const row of pending) {
  try {
    const d = new Date(row.created_at);
    const dir = join(ROOT, row.folder_path, ".voice-inbox", "inbox",
      String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, row.filename), row.markdown, "utf8");
    const patch = await fetch(`${BASE}/rest/v1/folder_exports?id=eq.${row.id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ status: "exported", exported_at: new Date().toISOString() }),
    });
    if (!patch.ok) throw new Error(`PATCH failed: HTTP ${patch.status}`);
    log(`exported ${row.folder_path}/${row.filename}`);
  } catch (e) {
    log(`FAILED ${row.id}: ${e}`);
    await fetch(`${BASE}/rest/v1/folder_exports?id=eq.${row.id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ status: "failed", error: String(e).slice(0, 500) }),
    }).catch(() => {});
  }
}

// ---------- Life-OS bridge ----------
async function setting(key) {
  const r = await fetch(`${BASE}/rest/v1/settings?key=eq.${key}&select=value`, { headers });
  const j = r.ok ? await r.json() : [];
  return j[0]?.value ?? null;
}

const lifeosFolderCfg = await setting("lifeos_folder");
if (lifeosFolderCfg) {
  // 'SANDBOX' writes to a test copy in the repo; otherwise a path under COWORK_ROOT.
  const lifeosDir = lifeosFolderCfg === "SANDBOX"
    ? join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..", "..", ".sandbox", "LIFE OS")
    : join(ROOT, lifeosFolderCfg);
  mkdirSync(lifeosDir, { recursive: true });
  const inboxPath = join(lifeosDir, "INBOX.md");

  // 1) Append queued voice items to INBOX.md (append-only).
  const q = await fetch(`${BASE}/rest/v1/lifeos_queue?status=eq.pending&select=id,line&order=created_at&limit=50`, { headers });
  const items = q.ok ? await q.json() : [];
  if (items.length > 0) {
    if (!existsSync(inboxPath)) {
      writeFileSync(inboxPath,
        "# INBOX.md — Voice Inbox → Life OS\n\n" +
        "*Items captured by voice via Voice Inbox (Slack). The daily/weekly briefs read and groom these into TASKS.md / OBJECTIVES.md, then clear them. Append-only from Voice Inbox.*\n\n" +
        "Format: `- [ ] task — project — when — added by Voice Inbox / date`\n\n## Captured (ungroomed)\n", "utf8");
    }
    for (const it of items) {
      try {
        appendFileSync(inboxPath, it.line.endsWith("\n") ? it.line : it.line + "\n", "utf8");
        await fetch(`${BASE}/rest/v1/lifeos_queue?id=eq.${it.id}`, { method: "PATCH", headers,
          body: JSON.stringify({ status: "appended", appended_at: new Date().toISOString() }) });
        log(`lifeos append: ${it.line.slice(0, 80)}`);
      } catch (e) {
        await fetch(`${BASE}/rest/v1/lifeos_queue?id=eq.${it.id}`, { method: "PATCH", headers,
          body: JSON.stringify({ status: "failed", error: String(e).slice(0, 300) }) }).catch(() => {});
        log(`lifeos append FAILED ${it.id}: ${e}`);
      }
    }
  }

  // 2) Sync the latest saved plan up so answer-back can read it in Slack.
  const planPath = join(lifeosDir, "LATEST_PLAN.md");
  if (existsSync(planPath)) {
    const content = readFileSync(planPath, "utf8").slice(0, 8000);
    await fetch(`${BASE}/rest/v1/settings?on_conflict=key`, {
      method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ key: "lifeos_latest_plan", value: content, updated_at: new Date().toISOString() }),
    }).catch((e) => log(`plan sync failed: ${e}`));
  }

  // 3) GLOBAL SESSION bus: append queued instruction blocks to GLOBAL_SESSION.md.
  const gsPath = join(lifeosDir, "GLOBAL_SESSION.md");
  const gq = await fetch(`${BASE}/rest/v1/global_session_queue?status=eq.pending&select=id,block&order=created_at&limit=50`, { headers });
  const gitems = gq.ok ? await gq.json() : [];
  if (gitems.length > 0) {
    if (!existsSync(gsPath)) {
      writeFileSync(gsPath,
        "# GLOBAL_SESSION.md — Voice Inbox → Claude projects/sessions\n\n" +
        "*Voice Inbox appends each substantive spoken instruction here (append-only), tagged with its project. A Claude Desktop scheduled task (every 15 min) reads items whose id has no result yet in GLOBAL_SESSION_RESULTS.md, processes each IN the relevant project session with full tools/connectors, and appends a result block there keyed by the same id. Voice Inbox posts those results back to Slack. Do not hand-edit item blocks.*\n\n---\n\n", "utf8");
    }
    for (const it of gitems) {
      try {
        appendFileSync(gsPath, it.block.endsWith("\n") ? it.block + "\n" : it.block + "\n\n", "utf8");
        await fetch(`${BASE}/rest/v1/global_session_queue?id=eq.${it.id}`, { method: "PATCH", headers,
          body: JSON.stringify({ status: "appended", appended_at: new Date().toISOString() }) });
        log(`global_session append: ${it.id}`);
      } catch (e) {
        await fetch(`${BASE}/rest/v1/global_session_queue?id=eq.${it.id}`, { method: "PATCH", headers,
          body: JSON.stringify({ status: "failed", error: String(e).slice(0, 300) }) }).catch(() => {});
        log(`global_session append FAILED ${it.id}: ${e}`);
      }
    }
  }

  // 4) Read the Desktop routine's results and post each new one back to Slack.
  const resPath = join(lifeosDir, "GLOBAL_SESSION_RESULTS.md");
  if (existsSync(resPath) && env.SLACK_BOT_TOKEN) {
    const text = readFileSync(resPath, "utf8");
    const re = /<!--\s*result:([0-9a-fA-F-]{36})\s*-->([\s\S]*?)<!--\s*\/result:\1\s*-->/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const capId = m[1];
      const inner = m[2].replace(/^\s*#{1,6}.*$/m, "").replace(/\*\*Result:\*\*/i, "").trim();
      // already posted?
      const seen = await fetch(`${BASE}/rest/v1/global_session_posted?capture_id=eq.${capId}&select=capture_id`, { headers });
      if ((seen.ok ? await seen.json() : []).length > 0) continue;
      const cap = await (await fetch(`${BASE}/rest/v1/captures?id=eq.${capId}&select=slack_channel_id,slack_message_ts,title`, { headers })).json();
      if (!cap[0]) continue;
      const post = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST", headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ channel: cap[0].slack_channel_id, thread_ts: cap[0].slack_message_ts,
          text: `🧠 *Your Claude session processed:* ${cap[0].title ?? ""}\n${inner.slice(0, 3500)}` }),
      });
      const pj = await post.json();
      if (pj.ok) {
        await fetch(`${BASE}/rest/v1/global_session_posted`, { method: "POST", headers, body: JSON.stringify({ capture_id: capId }) });
        log(`global_session result posted for ${capId}`);
      } else {
        log(`global_session result post failed for ${capId}: ${pj.error}`);
      }
    }
  }
}
