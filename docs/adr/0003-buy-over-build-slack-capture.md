# ADR-0003: Buy-over-build pivot — Slack capture, GitHub-hosted execution, no native app in v1

Date: 2026-07-18 · Status: Accepted · Supersedes parts of ADR-0002

## Context

After Phase 0 seeding, owner-commissioned research asked whether an existing product already delivers the chain *voice capture → transcription → routing → repo delivery → Claude Code execution → mobile clarification*. Conclusion (independently verified): no single product does, but the two expensive halves are commoditised — capture/transcription by consumer voice apps, and constrained agent execution by the official **Claude Code GitHub Action** (`@claude` on an issue → isolated GitHub runner → branch → PR, never merges). Only the middle — structuring, evidence-based routing, project registry, clarifications — is worth building, and that is the project's actual IP.

A binding constraint was then added: **no new paid subscriptions**.

## Options evaluated for capture

| Option | Verdict |
|---|---|
| Voicenotes app | Good fit technically (webhooks, API, Android background recording) but webhooks/API are behind its paid tier → fails the constraint |
| Telegram bot | Free, hold-to-record, inline-button clarifications; requires a second app the household doesn't currently use |
| **Slack audio clips** (chosen) | Workspace already paid; capture + notifications + one-tap interactive-button clarifications in one tool; family/team = workspace members; Events API → Supabase Edge Function |
| Official Anthropic Slack app ("Claude Tag") | Evaluated against docs: cannot transcribe audio, cannot trigger on Slack events, not pipeline-composable (ephemeral sandboxes, no webhooks/callbacks), Team/Enterprise plans only. Fine as a conversational teammate; not a Voice Inbox component |
| Owner's homegrown Slack bot (SLACK BOT project, Replit) | Well-built Claude-Tag replica, but same conversational shape — no audio path, Socket Mode needs an always-on host. Not reused; kept independent |

## Decision

1. **Capture**: a thin, dedicated Slack app ("Voice Inbox") — HTTP event subscriptions + interactivity pointed at Supabase Edge Functions. User records a Slack audio clip in `#voice-inbox` or DMs the app.
2. **Custody**: the ingest function immediately copies audio (and Slack's native clip transcript, if API-accessible) into the private Supabase bucket — the immutable source artefact stays owned (spec principle #1).
3. **Transcription**: OpenAI API pay-per-use (Slack's built-in clip transcript used as a free fast-path if retrievable).
4. **Execution**: Claude Code GitHub Action via `@claude` on a GitHub issue carrying the intake markdown — replaces the §17 local Windows runner entirely.
5. **Clarifications & notifications**: Slack interactive buttons / thread replies — replaces FCM.
6. **Cut from v1**: native Android app (Phase 1) and local runner (Phase 4). Both remain Plan B, revived only if Stage-1 evidence shows capture friction, privacy need (client-confidential audio transiting Slack), or clarification pain.

## Consequences

- New recurring cost: £0. Pay-per-use: transcription ≈ £0.30/hour of audio + LLM structuring/routing pennies. GitHub Actions free tier (2,000 min/mo private repos).
- Spec §26 acceptance criteria re-map: "two taps" → record clip + send; "app survives termination" → Slack's problem; runner criteria (9, 10) → GitHub Action isolation + repo permissions; everything else unchanged.
- The §8 state machine loses `recording/recorded/upload_queued/uploading` (Slack owns those) and starts at `uploaded`.
- Non-repo destinations (ideas, family projects) route to a general-inbox repo or store-only — matches `store_only` intent semantics.
- Multi-user identity comes free from Slack user IDs.
- If Plan B is ever exercised, contracts, migrations, routing engine and evals transfer unchanged; only the capture client and runner return.
