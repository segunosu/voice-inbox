-- Custom schemas get no automatic role grants (unlike `public`).
-- Edge Functions run as service_role via PostgREST: grant it full access.
-- anon/authenticated intentionally get NOTHING (defense in depth on top of RLS).

grant usage on schema voice_inbox to service_role;
grant all on all tables in schema voice_inbox to service_role;
grant all on all sequences in schema voice_inbox to service_role;
grant execute on all functions in schema voice_inbox to service_role;

alter default privileges in schema voice_inbox
  grant all on tables to service_role;
alter default privileges in schema voice_inbox
  grant all on sequences to service_role;
alter default privileges in schema voice_inbox
  grant execute on functions to service_role;
