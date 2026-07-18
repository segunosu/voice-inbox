# SECURITY.md — baseline

## Secrets

- **No secrets in this repository, ever.** `.gitignore` blocks `.env*` (except `.env.example`); CI will add secret scanning in Phase 0.
- **No secrets in cloud-synced folders** (Google Drive / OneDrive / Dropbox). The canonical secrets store for this machine is `C:\Users\Oem\.secrets\voice-inbox.env` (local-only, per-project files).
- `.env.example` lists variable **names only**, with comments.
- Services validate configuration at startup and **fail closed**.
- Separate development and production credentials; runner and webhook secrets are rotated on a schedule.
- Android access tokens live in Android Keystore-backed storage, never plaintext preferences.
- Supabase: publishable key only in clients; service-role key only in Edge Functions / server contexts; RLS enabled on every table.

## Threat model & controls

The full threat model and control list is §19 of [the spec](docs/spec/voice-inbox-spec-v1.md). Non-negotiables:

- Transcripts are **untrusted input** at every stage (structuring, routing, agent execution). Spoken content can never override system prompts, repository policy or CLAUDE.md.
- Webhooks are signed with timestamp + replay window; all events carry IDs and are consumed idempotently.
- The agent runner operates only in isolated worktrees on allowlisted repositories, with parsed command allowlists (no free-form shell), forbidden-path patterns, no auto-merge, no force-push, no deploys.
- Object storage is private; access is via short-lived signed URLs only.
- Default project execution mode is `approval_required`.

## Reporting

Single-owner project; issues go to segun.osu@teamsmiths.com.
