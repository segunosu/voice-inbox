# Voice Inbox

**Speak once. The correct project receives the useful result without copying, exporting or repeating the information.**

Voice Inbox captures a spoken note, meeting reflection, requirement, bug report, decision or instruction on an Android phone and converts it into structured, traceable work inside the correct project — transcribed, structured, routed, written as a markdown intake, and (where project policy allows) executed by a constrained Claude Code runner on an isolated git branch.

## Canonical documents

| Document | Purpose |
|---|---|
| [docs/spec/voice-inbox-spec-v1.md](docs/spec/voice-inbox-spec-v1.md) | Product & technical specification v1.0 (source of truth) |
| [DECISIONS.md](DECISIONS.md) | Running log of every material decision and its reasoning |
| [docs/adr/](docs/adr/) | Architecture decision records |
| [SECURITY.md](SECURITY.md) | Security baseline and secrets policy |
| [CLAUDE.md](CLAUDE.md) | Instructions for AI agents working in this repository |

## Architecture at a glance

- **Backend**: Supabase (PostgreSQL + object storage + auth + Edge Functions). There is **no n8n** — orchestration is Edge Functions + a transactional outbox + pg_cron (see ADR-0001).
- **Capture client**: native Android (Kotlin / Jetpack Compose), sideloaded signed APK, Samsung S24 first device.
- **AI**: OpenAI transcription; Claude (Anthropic) for structuring and routing adjudication; Supabase built-in gte-small + pgvector for embeddings.
- **Agent runner**: always-on Windows machine invoking Claude Code headless in isolated git worktrees under a strict policy wrapper.

## Delivery method

This project follows the AI Software Delivery Kit discipline: Gherkin acceptance specs are written **before** build, every phase has explicit exit conditions verified by driving the real system, decisions are logged, and an honesty file separates VERIFIED / ASSUMED / UNKNOWN. Phases 0–6 are defined in §23 of the spec.

## Status

Phase 0 (repository and contracts) — in progress.
