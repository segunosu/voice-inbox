-- Seed the project registry (§9.6/9.7) for the owner (first registered user).
-- Idempotent: safe to re-run. Registry grows via admin endpoints later.

do $$
declare
  v_user uuid;
  v_voice uuid; v_tpm uuid; v_alpha uuid; v_general uuid;
begin
  select id into v_user from voice_inbox.users order by created_at limit 1;
  if v_user is null then
    raise exception 'no users yet — send a capture first';
  end if;

  insert into voice_inbox.projects (user_id, name, slug, description, status, repository_url, default_branch, execution_mode)
  values
    (v_user, 'Voice Inbox', 'voice-inbox',
     'The voice capture pipeline itself: Slack audio clips, Supabase Edge Functions, transcription, routing, GitHub dispatch. Android app is Plan B. Repo: segunosu/voice-inbox.',
     'active', 'https://github.com/segunosu/voice-inbox', 'main', 'approval_required'),
    (v_user, 'The Player''s Mind', 'tpm',
     'Youth-football mental-fitness app (TPM): Family and Club plans, mindset training for young footballers, parents and coaches. Lovable + Supabase (calarossa).',
     'active', null, null, 'capture_only'),
    (v_user, 'AI Alpha OS', 'ai-alpha-os',
     'Agile AI Alpha engine inside the teamsmiths.ai app: aaos_ schema, sprints, agents, admin-only access.',
     'active', null, null, 'capture_only'),
    (v_user, 'General Inbox', 'general-inbox',
     'Catch-all for ideas, notes and captures that do not belong to a specific registered project.',
     'active', null, null, 'capture_only')
  on conflict (user_id, slug) do nothing;

  select id into v_voice from voice_inbox.projects where user_id = v_user and slug = 'voice-inbox';
  select id into v_tpm from voice_inbox.projects where user_id = v_user and slug = 'tpm';
  select id into v_alpha from voice_inbox.projects where user_id = v_user and slug = 'ai-alpha-os';
  select id into v_general from voice_inbox.projects where user_id = v_user and slug = 'general-inbox';

  insert into voice_inbox.project_aliases (project_id, alias, normalised_alias, alias_type)
  select * from (values
    (v_voice, 'Voice Inbox', 'voice inbox', 'name'),
    (v_voice, 'Voiceinbox', 'voiceinbox', 'speech'),
    (v_voice, 'Voice in box', 'voice in box', 'speech'),
    (v_tpm, 'The Player''s Mind', 'the players mind', 'name'),
    (v_tpm, 'Players Mind', 'players mind', 'short'),
    (v_tpm, 'TPM', 'tpm', 'acronym'),
    (v_tpm, 'The Footballer''s Mind', 'the footballers mind', 'legacy'),
    (v_alpha, 'AI Alpha OS', 'ai alpha os', 'name'),
    (v_alpha, 'Alpha OS', 'alpha os', 'short'),
    (v_general, 'General Inbox', 'general inbox', 'name'),
    (v_general, 'General', 'general', 'short')
  ) as t(project_id, alias, normalised_alias, alias_type)
  where not exists (
    select 1 from voice_inbox.project_aliases pa
    where pa.project_id = t.project_id and pa.normalised_alias = t.normalised_alias
  );
end $$;
