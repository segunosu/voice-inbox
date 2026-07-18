-- Atomic capture creation + outbox event (transactional outbox, spec §20.2).
-- SECURITY DEFINER so the service role calls one narrow entry point.

create or replace function voice_inbox.create_capture_with_event(
  p_user_id uuid,
  p_channel text,
  p_ts text,
  p_idempotency_key text,
  p_audio_object_key text,
  p_audio_sha256 text,
  p_audio_mime_type text,
  p_duration_ms integer,
  p_recorded_at timestamptz,
  p_slack_native_transcript text,
  p_slack_user_id text
) returns uuid
language plpgsql
security definer
set search_path = voice_inbox, pg_temp
as $$
declare
  v_capture_id uuid;
  v_correlation uuid := gen_random_uuid();
  v_event_id uuid := gen_random_uuid();
begin
  insert into voice_inbox.captures (
    user_id, source, slack_channel_id, slack_message_ts, idempotency_key,
    status, audio_object_key, audio_sha256, audio_mime_type, duration_ms,
    recorded_at, uploaded_at, slack_native_transcript
  ) values (
    p_user_id, 'slack', p_channel, p_ts, p_idempotency_key,
    'uploaded', p_audio_object_key, p_audio_sha256, p_audio_mime_type, p_duration_ms,
    p_recorded_at, now(), p_slack_native_transcript
  )
  on conflict (slack_channel_id, slack_message_ts) do nothing
  returning id into v_capture_id;

  if v_capture_id is null then
    -- duplicate delivery: return the existing capture, emit nothing
    select id into v_capture_id from voice_inbox.captures
      where slack_channel_id = p_channel and slack_message_ts = p_ts;
    return v_capture_id;
  end if;

  insert into voice_inbox.outbox_events (id, event_type, aggregate_id, payload_json)
  values (
    v_event_id,
    'capture.uploaded',
    v_capture_id,
    jsonb_build_object(
      'eventId', v_event_id,
      'eventType', 'capture.uploaded',
      'occurredAt', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF'),
      'correlationId', v_correlation,
      'captureId', v_capture_id,
      'audioObjectKey', p_audio_object_key,
      'mimeType', p_audio_mime_type,
      'sha256', p_audio_sha256,
      'source', 'slack',
      'slackChannelId', p_channel,
      'slackMessageTs', p_ts,
      'slackUserId', p_slack_user_id,
      'slackNativeTranscript', p_slack_native_transcript
    )
  );

  insert into voice_inbox.audit_events (
    aggregate_type, aggregate_id, event_type, actor_type, actor_id, correlation_id, payload_json
  ) values (
    'capture', v_capture_id, 'capture.uploaded', 'slack_user', p_slack_user_id, v_correlation,
    jsonb_build_object('audioObjectKey', p_audio_object_key, 'sha256', p_audio_sha256)
  );

  return v_capture_id;
end;
$$;

revoke all on function voice_inbox.create_capture_with_event(
  uuid, text, text, text, text, text, text, integer, timestamptz, text, text
) from public, anon, authenticated;

-- Private audio bucket (idempotent).
insert into storage.buckets (id, name, public)
values ('voice-inbox-audio', 'voice-inbox-audio', false)
on conflict (id) do nothing;
