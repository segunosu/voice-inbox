/**
 * Voice Inbox folder exporter — runs on the always-on PC every 5 minutes
 * (Windows Task Scheduler). Pulls pending folder_exports from Supabase and
 * writes each intake as a §12-style markdown file inside the matching
 * Drive-synced Cowork project folder; Google Drive for Desktop syncs it up.
 *
 * Config: C:\Users\Oem\.secrets\voice-inbox.env  (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, COWORK_ROOT)
 * No dependencies — Node 20+ built-ins only.
 */

import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
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
if (pending.length === 0) { process.exit(0); }

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
