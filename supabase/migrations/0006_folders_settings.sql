-- Folder destinations (owner request 2026-07-18): non-repo captures materialise
-- as §12 intake .md files inside the matching Drive-synced Cowork folder,
-- written by the local exporter on the always-on PC.

alter table voice_inbox.projects add column if not exists folder_path text;

create table if not exists voice_inbox.folder_exports (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid not null references voice_inbox.captures(id),
  project_id uuid not null references voice_inbox.projects(id),
  folder_path text not null,
  filename text not null,
  markdown text not null,
  status text not null default 'pending' check (status in ('pending','exported','failed')),
  error text,
  created_at timestamptz not null default now(),
  exported_at timestamptz
);
alter table voice_inbox.folder_exports enable row level security;
grant all on voice_inbox.folder_exports to service_role;

-- Service-role-only settings store (keeps secrets out of git-tracked cron SQL).
create table if not exists voice_inbox.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table voice_inbox.settings enable row level security;
grant all on voice_inbox.settings to service_role;

-- Folder destinations for existing projects (paths relative to the Cowork root
-- so the exporter owns the drive prefix).
update voice_inbox.projects set folder_path = 'Piscina Alta - Calarossa' where slug = 'piscina-alta' and folder_path is null;
update voice_inbox.projects set folder_path = 'The Footballer''s Mind' where slug = 'tpm' and folder_path is null;
update voice_inbox.projects set folder_path = 'TEAMSMITHS' where slug = 'ai-alpha-os' and folder_path is null;
update voice_inbox.projects set folder_path = 'GENERAL INBOX' where slug = 'general-inbox' and folder_path is null;
