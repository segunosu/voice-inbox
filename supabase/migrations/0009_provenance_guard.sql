-- Incident remedy (2026-07-19): a developer-inserted synthetic test capture
-- was dispatched against the REAL Piscina Alta project, writing a real file
-- to the owner's Drive-synced folder and sending a real Slack notification
-- with no genuine spoken request behind it. Root causes: (1) testing used a
-- real project + the real #voice-inbox channel instead of an isolated
-- sandbox, (2) nothing technically enforced that dispatch/session actions
-- require verified evidence of a real recording.
--
-- Fix: a dedicated sandbox project that can never touch real Cowork
-- folders/repos, plus an application-level provenance guard (below, in
-- dispatch-github and session-runner) requiring audio_object_key to be set
-- for any action against a non-sandbox project. Reprocessing (spec §20.4)
-- reuses the original audio_object_key, so it is unaffected.

alter table voice_inbox.projects add column if not exists is_sandbox boolean not null default false;

insert into voice_inbox.projects (user_id, name, slug, description, status, execution_mode, folder_path, is_sandbox)
select id, 'Test Sandbox', 'test-sandbox',
  'Development/testing only — never a real project. Used to verify pipeline behaviour without ever touching real Cowork folders, repositories, or sending notifications a user could mistake for a genuine request.',
  'active', 'docs_auto', 'output', true
from voice_inbox.users order by created_at limit 1
on conflict (user_id, slug) do update set is_sandbox = true;
