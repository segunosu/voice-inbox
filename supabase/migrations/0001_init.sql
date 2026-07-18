-- Voice Inbox — initial schema (spec §9, amended by ADR-0003: Slack capture,
-- GitHub Action execution). Everything lives in the dedicated `voice_inbox`
-- schema; RLS is enabled on every table with NO policies, so only the
-- service role (Edge Functions) can touch data. The spec's `devices` table is
-- omitted: identity comes from Slack user IDs (ADR-0003).

create extension if not exists vector with schema extensions;

create schema if not exists voice_inbox;

-- 9.1 users (Slack-identified)
create table voice_inbox.users (
  id uuid primary key default gen_random_uuid(),
  slack_user_id text not null unique,
  email text unique,
  display_name text,
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 9.6 projects (before captures: captures references it)
create table voice_inbox.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references voice_inbox.users(id),
  name text not null,
  slug text not null,
  description text not null,
  status text not null default 'active',
  repository_url text,
  default_branch text,
  execution_mode text not null default 'approval_required'
    check (execution_mode in ('capture_only','analyse_only','docs_auto','branch_auto','approval_required','disabled')),
  routing_threshold numeric not null default 0.88,
  ambiguity_margin numeric not null default 0.08,
  agent_instructions_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

-- 9.3 captures (source = slack; recording/upload states owned by Slack)
create table voice_inbox.captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references voice_inbox.users(id),
  source text not null default 'slack' check (source in ('slack')),
  slack_channel_id text not null,
  slack_message_ts text not null,
  idempotency_key text not null,
  status text not null default 'uploaded',
  title text,
  duration_ms integer,
  audio_object_key text,
  audio_sha256 text,
  audio_mime_type text,
  slack_native_transcript text,
  recorded_at timestamptz not null,
  uploaded_at timestamptz,
  explicit_project_phrase text,
  selected_project_id uuid references voice_inbox.projects(id),
  route_confidence numeric,
  route_method text,
  execution_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slack_channel_id, slack_message_ts),
  unique (user_id, idempotency_key)
);

-- 9.4 transcripts
create table voice_inbox.transcripts (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references voice_inbox.captures(id),
  provider text not null,
  model text not null,
  language text,
  raw_text text not null,
  segments_json jsonb,
  provider_response_object_key text,
  version integer not null,
  created_at timestamptz not null default now(),
  unique (capture_id, version)
);

-- 9.5 structured_intakes
create table voice_inbox.structured_intakes (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references voice_inbox.captures(id),
  transcript_id uuid not null references voice_inbox.transcripts(id),
  schema_version text not null,
  content_json jsonb not null,
  summary text not null,
  intent text not null,
  risk_level text not null,
  requires_clarification boolean not null,
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now()
);

-- 9.7 project_aliases
create table voice_inbox.project_aliases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references voice_inbox.projects(id),
  alias text not null,
  normalised_alias text not null,
  alias_type text not null default 'name',
  priority integer not null default 100,
  created_at timestamptz not null default now()
);
create index project_aliases_normalised_idx on voice_inbox.project_aliases (normalised_alias);

-- 9.8 project_routing_profiles (gte-small embeddings are 384-dimensional)
create table voice_inbox.project_routing_profiles (
  project_id uuid primary key references voice_inbox.projects(id),
  positive_keywords jsonb not null default '[]',
  negative_keywords jsonb not null default '[]',
  examples jsonb not null default '[]',
  recent_context_summary text,
  embedding extensions.vector(384),
  profile_version integer not null default 1,
  updated_at timestamptz not null default now()
);

-- 9.9 routing_candidates
create table voice_inbox.routing_candidates (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references voice_inbox.captures(id),
  project_id uuid not null references voice_inbox.projects(id),
  rank integer not null,
  alias_score numeric,
  keyword_score numeric,
  embedding_score numeric,
  recency_score numeric,
  llm_score numeric,
  combined_score numeric not null,
  evidence_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- 9.10 clarifications (delivered as Slack interactive messages)
create table voice_inbox.clarifications (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references voice_inbox.captures(id),
  question_type text not null check (question_type in ('routing','approval')),
  question_text text not null,
  options_json jsonb not null,
  status text not null default 'pending' check (status in ('pending','answered','expired','cancelled')),
  slack_channel_id text,
  slack_message_ts text,
  response_json jsonb,
  responded_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- 9.11 agent_jobs (executed by Claude Code GitHub Action, ADR-0003)
create table voice_inbox.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references voice_inbox.captures(id),
  project_id uuid not null references voice_inbox.projects(id),
  status text not null default 'queued',
  requested_mode text not null,
  intake_relative_path text not null,
  github_issue_url text,
  attempt_count integer not null default 0,
  policy_snapshot_json jsonb not null default '{}',
  result_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- 9.12 agent_runs
create table voice_inbox.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_job_id uuid not null references voice_inbox.agent_jobs(id),
  agent_name text not null default 'claude-code-github-action',
  agent_version text,
  model text,
  session_identifier text,
  branch_name text,
  pr_url text,
  commit_sha text,
  changed_files_json jsonb,
  tests_json jsonb,
  report_object_key text,
  error_category text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 9.13 audit_events (append-only)
create table voice_inbox.audit_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null,
  aggregate_id uuid not null,
  event_type text not null,
  actor_type text not null,
  actor_id text,
  correlation_id uuid not null,
  payload_json jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_events_aggregate_idx on voice_inbox.audit_events (aggregate_type, aggregate_id, created_at);

-- 9.14 outbox_events (transactional outbox, §20.2)
create table voice_inbox.outbox_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  aggregate_id uuid not null,
  payload_json jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','delivered','dead_letter')),
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
create index outbox_events_dispatch_idx on voice_inbox.outbox_events (status, available_at);

-- consumed event ledger for idempotent consumers (§14: reject duplicate effects)
create table voice_inbox.consumed_events (
  event_id uuid primary key,
  consumer text not null,
  consumed_at timestamptz not null default now()
);

-- RLS: enable everywhere, define no policies — service role only.
alter table voice_inbox.users enable row level security;
alter table voice_inbox.projects enable row level security;
alter table voice_inbox.captures enable row level security;
alter table voice_inbox.transcripts enable row level security;
alter table voice_inbox.structured_intakes enable row level security;
alter table voice_inbox.project_aliases enable row level security;
alter table voice_inbox.project_routing_profiles enable row level security;
alter table voice_inbox.routing_candidates enable row level security;
alter table voice_inbox.clarifications enable row level security;
alter table voice_inbox.agent_jobs enable row level security;
alter table voice_inbox.agent_runs enable row level security;
alter table voice_inbox.audit_events enable row level security;
alter table voice_inbox.outbox_events enable row level security;
alter table voice_inbox.consumed_events enable row level security;
