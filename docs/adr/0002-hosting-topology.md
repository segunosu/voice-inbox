# ADR-0002: Hosting topology — Supabase backend, local Android build, Windows runner

Date: 2026-07-18 · Status: Accepted

## Context

Candidate platforms considered: Replit, Lovable, Supabase, and "residing with Claude" (running inside Claude Code sessions).

## Decision

| Component | Home | Rationale |
|---|---|---|
| API, DB, storage, orchestration | Supabase (dedicated project) | Already subscribed; covers §6–§15 natively; must run 24/7 independent of any Claude session |
| Android capture app | Built locally with Claude Code; signed APK sideloaded (Samsung S24 first) | Native Kotlin cannot be produced by Lovable (web-only) or built on Replit (no Android toolchain) |
| Agent runner (§17) | Owner's always-on Windows PC invoking Claude Code headless (`claude -p` / Agent SDK) in isolated worktrees | Spec requires local repositories and a leased-job pull model; uses the existing Claude subscription |
| Admin dashboard | Monorepo (`apps/admin-web`), later phase | Shares the contracts package; Lovable optional but not preferred |

Rejected: Replit (duplicates Supabase, adds a platform); Lovable for core (web-only); pipeline-inside-Claude-sessions (capture must process around the clock).

## Consequences

- The Windows PC is infrastructure: runner health monitoring and heartbeats (§13.11) matter from Phase 4.
- Android toolchain (JDK 17, Android command-line tools, Gradle) must be installed headlessly on the PC — no Android Studio required.
- Backend deploys are `supabase db push` + function deploys from CI, not a PaaS pipeline.
