-- 2026-07-19 incident fix: migration 0010 added p_kind to create_capture_with_event,
-- but CREATE OR REPLACE only replaces an identical signature — so it created a
-- SECOND overload instead of replacing the old 12-arg one. The audio ingest path
-- calls with 12 args (no p_kind), which now matches BOTH → PostgREST PGRST203
-- ("could not choose the best candidate function") → audio captures silently fail.
-- Drop the stale 12-arg overload; the 13-arg version (p_kind default 'audio') covers both.

-- The stale overload was the ORIGINAL 11-arg version (migration 0002, before
-- p_reply_to and p_kind were added). Later CREATE OR REPLACEs changed the
-- signature and thus never replaced it. Drop it; the 13-arg version remains.
drop function if exists voice_inbox.create_capture_with_event(
  uuid, text, text, text, text, text, text, integer, timestamp with time zone, text, text
);
