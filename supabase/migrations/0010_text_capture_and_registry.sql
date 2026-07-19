-- 2026-07-19: (a) register the owner's real "Goals, Projects, and Work
-- Dashboard" project + known Deputee/Teamsmiths projects so genuine voice
-- references route instead of asking; (b) support TEXT captures and a
-- per-project persistent session; (c) make the provenance guard work for
-- both audio and text by keying on source_verified (set only by the ingest
-- RPC) rather than audio presence.

alter table voice_inbox.captures add column if not exists source_verified boolean not null default false;
alter table voice_inbox.captures add column if not exists capture_kind text not null default 'audio';
alter table voice_inbox.projects add column if not exists session_identifier text;

-- Backfill: every existing real audio capture was genuinely ingested.
update voice_inbox.captures set source_verified = true where audio_object_key is not null and source_verified = false;

-- RPC now stamps provenance and accepts a capture kind (audio|text). Only
-- slack-ingest calls this; direct DB inserts never get source_verified.
create or replace function voice_inbox.create_capture_with_event(
  p_user_id uuid, p_channel text, p_ts text, p_idempotency_key text,
  p_audio_object_key text, p_audio_sha256 text, p_audio_mime_type text,
  p_duration_ms integer, p_recorded_at timestamptz, p_slack_native_transcript text,
  p_slack_user_id text, p_reply_to uuid default null, p_kind text default 'audio'
) returns uuid
language plpgsql security definer set search_path = voice_inbox, pg_temp
as $$
declare v_capture_id uuid; v_correlation uuid := gen_random_uuid(); v_event_id uuid := gen_random_uuid();
begin
  insert into voice_inbox.captures (
    user_id, source, slack_channel_id, slack_message_ts, idempotency_key, status,
    audio_object_key, audio_sha256, audio_mime_type, duration_ms, recorded_at,
    uploaded_at, slack_native_transcript, reply_to_capture_id, source_verified, capture_kind
  ) values (
    p_user_id, 'slack', p_channel, p_ts, p_idempotency_key, 'uploaded',
    p_audio_object_key, p_audio_sha256, p_audio_mime_type, p_duration_ms, p_recorded_at,
    now(), p_slack_native_transcript, p_reply_to, true, p_kind
  )
  on conflict (slack_channel_id, slack_message_ts) do nothing
  returning id into v_capture_id;

  if v_capture_id is null then
    select id into v_capture_id from voice_inbox.captures where slack_channel_id = p_channel and slack_message_ts = p_ts;
    return v_capture_id;
  end if;

  insert into voice_inbox.outbox_events (id, event_type, aggregate_id, payload_json)
  values (v_event_id, 'capture.uploaded', v_capture_id, jsonb_build_object(
    'eventId', v_event_id, 'eventType', 'capture.uploaded',
    'occurredAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'), 'correlationId', v_correlation,
    'captureId', v_capture_id, 'audioObjectKey', p_audio_object_key, 'mimeType', p_audio_mime_type,
    'sha256', p_audio_sha256, 'source', 'slack', 'kind', p_kind, 'slackChannelId', p_channel,
    'slackMessageTs', p_ts, 'slackUserId', p_slack_user_id, 'slackNativeTranscript', p_slack_native_transcript));

  insert into voice_inbox.audit_events (aggregate_type, aggregate_id, event_type, actor_type, actor_id, correlation_id, payload_json)
  values ('capture', v_capture_id, 'capture.uploaded', 'slack_user', p_slack_user_id, v_correlation,
    jsonb_build_object('kind', p_kind, 'audioObjectKey', p_audio_object_key));

  return v_capture_id;
end;
$$;
revoke all on function voice_inbox.create_capture_with_event(uuid,text,text,text,text,text,text,integer,timestamptz,text,text,uuid,text) from public, anon, authenticated;

-- Register real projects (idempotent).
do $$
declare v_user uuid; v_dash uuid; v_ct uuid; v_proc uuid; v_coach uuid; v_tax uuid;
begin
  select id into v_user from voice_inbox.users order by created_at limit 1;

  insert into voice_inbox.projects (user_id, name, slug, description, status, execution_mode, folder_path) values
    (v_user, 'Goals, Projects, and Work Dashboard', 'goals-projects-work-dashboard',
     'The owner''s master dashboard for goals, active projects, priorities and daily/weekly plan. Where "what''s my plan / schedule / priorities today" questions belong.',
     'active', 'docs_auto', 'Goals, Projects, and Work Dashboard'),
    (v_user, 'Council Tax Platform', 'council-tax-platform',
     'Council Tax challenge / Council Tax Deputee product — helping households challenge and reduce council tax banding.',
     'active', 'capture_only', 'Council Tax Platform'),
    (v_user, 'Procurement Deputee', 'procurement-deputee',
     'Procurement Deputee product — procurement automation and bid/tender support.',
     'active', 'capture_only', 'Procurement Deputee'),
    (v_user, 'Deputee Coach', 'deputee-coach',
     'Deputee Coach product — AI coaching assistant.',
     'active', 'capture_only', 'Deputee Coach'),
    (v_user, 'Tax Bot', 'tax-bot',
     'Tax Deputee / Tax Bot — tax assistance product.',
     'active', 'capture_only', 'TAX BOT')
  on conflict (user_id, slug) do nothing;

  select id into v_dash from voice_inbox.projects where user_id=v_user and slug='goals-projects-work-dashboard';
  select id into v_ct from voice_inbox.projects where user_id=v_user and slug='council-tax-platform';
  select id into v_proc from voice_inbox.projects where user_id=v_user and slug='procurement-deputee';
  select id into v_coach from voice_inbox.projects where user_id=v_user and slug='deputee-coach';
  select id into v_tax from voice_inbox.projects where user_id=v_user and slug='tax-bot';

  insert into voice_inbox.project_aliases (project_id, alias, normalised_alias, alias_type)
  select * from (values
    (v_dash, 'Goals, Projects, and Work Dashboard', 'goals projects and work dashboard', 'name'),
    (v_dash, 'Goals Projects Work Dashboard', 'goals projects work dashboard', 'name'),
    (v_dash, 'Work Dashboard', 'work dashboard', 'short'),
    (v_dash, 'Projects Dashboard', 'projects dashboard', 'short'),
    (v_dash, 'My Dashboard', 'my dashboard', 'short'),
    (v_dash, 'Goals and Projects', 'goals and projects', 'short'),
    (v_ct, 'Council Tax Platform', 'council tax platform', 'name'),
    (v_ct, 'Council Tax', 'council tax', 'short'),
    (v_ct, 'Council Tax Deputee', 'council tax deputee', 'alt'),
    (v_proc, 'Procurement Deputee', 'procurement deputee', 'name'),
    (v_proc, 'Procurement', 'procurement', 'short'),
    (v_coach, 'Deputee Coach', 'deputee coach', 'name'),
    (v_tax, 'Tax Bot', 'tax bot', 'name'),
    (v_tax, 'Tax Deputee', 'tax deputee', 'alt')
  ) as t(project_id, alias, normalised_alias, alias_type)
  where not exists (select 1 from voice_inbox.project_aliases pa where pa.project_id=t.project_id and pa.normalised_alias=t.normalised_alias);

  -- Route the two stuck genuine captures to the now-registered dashboard.
  update voice_inbox.captures
    set selected_project_id = v_dash, route_confidence = 1, route_method = 'manual_backfill', status = 'routed'
    where id in ('15fe3f71-0000-0000-0000-000000000000') or explicit_project_phrase ilike '%Goals, Projects%';
end $$;
