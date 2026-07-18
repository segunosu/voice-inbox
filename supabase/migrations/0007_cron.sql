-- Scheduled operations (ADR-0001: pg_cron + pg_net replace n8n's schedulers).
-- The pipeline secret is read from voice_inbox.settings at run time — never
-- stored in this git-tracked file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Retry sweep every 15 minutes: nudges retryable failures and stuck states.
select cron.schedule(
  'voice-inbox-sweep',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://oqruqictijboujiuzqnf.supabase.co/functions/v1/digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (select value from voice_inbox.settings where key = 'pipeline_secret')
    ),
    body := '{"mode":"sweep"}'::jsonb
  );
  $$
);

-- Daily digest at 17:00 UTC (~18:00 London in summer).
select cron.schedule(
  'voice-inbox-digest',
  '0 17 * * *',
  $$
  select net.http_post(
    url := 'https://oqruqictijboujiuzqnf.supabase.co/functions/v1/digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-pipeline-secret', (select value from voice_inbox.settings where key = 'pipeline_secret')
    ),
    body := '{"mode":"digest"}'::jsonb
  );
  $$
);
