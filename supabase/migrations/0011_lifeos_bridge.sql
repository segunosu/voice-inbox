-- 2026-07-19: Life-OS bridge. Voice captures feed a central INBOX.md that the
-- owner's daily/weekly briefs groom into TASKS.md (owner-confirmed design 1b).
-- Cloud functions can't touch the local Drive, so they QUEUE append lines here;
-- the local exporter (on the always-on PC) does the physical append + syncs the
-- latest saved plan back up so answer-back can read it (design 3b).

create table if not exists voice_inbox.lifeos_queue (
  id uuid primary key default gen_random_uuid(),
  capture_id uuid references voice_inbox.captures(id),
  line text not null,
  status text not null default 'pending' check (status in ('pending','appended','failed')),
  error text,
  created_at timestamptz not null default now(),
  appended_at timestamptz
);
alter table voice_inbox.lifeos_queue enable row level security;
grant all on voice_inbox.lifeos_queue to service_role;

-- Config the local sync reads (relative to COWORK_ROOT). Real path set after
-- the owner has seen the sandbox test pass.
insert into voice_inbox.settings (key, value) values
  ('lifeos_folder', 'SANDBOX'),                       -- 'SANDBOX' = write to repo .sandbox/LIFE OS for testing
  ('lifeos_folder_real', 'GLOBAL plus .env.local/LIFE OS')
on conflict (key) do nothing;
