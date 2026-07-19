-- 2026-07-19: GLOBAL SESSION bus (owner design). Substantive voice instructions
-- are routed and appended (append-only) to GLOBAL_SESSION.md in the Life-OS
-- folder. A Claude Desktop scheduled task (every 15 min) reads new items,
-- processes each IN the project session with full tools/connectors, and appends
-- a result block to GLOBAL_SESSION_RESULTS.md keyed by capture id. The local
-- exporter reads results and posts them back to the capture's Slack thread.
-- Append-only on both sides (no concurrent edits) => Drive-sync safe.

create table if not exists voice_inbox.global_session_queue (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid references voice_inbox.captures(id),
  project_slug text,
  project_name text,
  block text not null,
  status text not null default 'pending' check (status in ('pending','appended','failed')),
  error text,
  created_at timestamptz not null default now(),
  appended_at timestamptz
);
alter table voice_inbox.global_session_queue enable row level security;
grant all on voice_inbox.global_session_queue to service_role;

-- Which result blocks have already been posted to Slack (idempotent readback).
create table if not exists voice_inbox.global_session_posted (
  capture_id uuid primary key,
  posted_at timestamptz not null default now()
);
alter table voice_inbox.global_session_posted enable row level security;
grant all on voice_inbox.global_session_posted to service_role;
