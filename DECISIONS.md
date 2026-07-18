# DECISIONS.md — running decision log

Format: date · decision · reasoning · status. Newest first. Decisions are never silently rewritten; superseded entries are marked as such.

---

## 2026-07-18 (evening) — Phase 0 exit gate met; ingest deployed

12. **Phase 0 exit conditions all verified**: contracts typecheck + 15 tests green (fake capture traverses the simulated state machine); migrations 0001+0002 applied to the live project (14 tables, RLS on all, capture RPC with transactional outbox, private audio bucket); Gherkin specs for all 17 §26 criteria committed before build; **CI green on GitHub Actions**. **DONE**

13. **slack-ingest Edge Function deployed** (`--no-verify-jwt`; Slack signs requests instead — signature verified with ±5min replay window, fail closed; url_verification handshake served pre-secret so the app can be created from the manifest). Verified live: handshake echoes, unsigned events → 401. `voice_inbox` schema exposed to PostgREST for supabase-js. **DONE**

---

## 2026-07-18 (later) — Buy-over-build pivot

10. **Slack capture replaces the native Android app; Claude Code GitHub Action replaces the local runner.** Owner research + verification showed the capture and execution halves are commoditised; constraint added: no new paid subscriptions. Chosen: thin dedicated Slack app (audio clips → Events API → Supabase Edge Functions) for capture/clarifications/notifications; `@claude` GitHub issues for execution. Voicenotes (paid tier), Telegram (second app), official Claude Tag (no audio, no event triggers, Team/Enterprise-only) and the owner's homegrown Slack bot (conversational shape, Socket Mode) all evaluated and set aside. Native app + local runner remain Plan B. → ADR-0003. **CONFIRMED**

11. **Secrets migration executed.** All 23 `.env*` files on the Drive-synced workspace moved to `C:\Users\Oem\.secrets\drive-migration\` with pointer stubs left behind; Drive tree verified clean of live token patterns. Outstanding: owner must rotate 4 exposed GitHub PATs + old Firecrawl key; a 5th PAT found embedded in the `teamsmiths-ai-deputees` git remote URL (now stripped from `.git/config`) also needs rotation. **DONE (rotation pending, owner action)**

## 2026-07-18 — Project inception decisions (owner interview)

1. **No n8n.** All orchestration (§15 workflows in the spec) is implemented as Supabase Edge Functions driven by a transactional outbox + pg_cron dispatcher. Reasoning: owner already subscribes to Supabase; n8n would add a second host, second credential store and second failure domain for a system whose spec already mandates Postgres-as-truth with an outbox; workflow logic in TypeScript in git beats exported workflow JSON. → ADR-0001. **CONFIRMED**

2. **Multi-user (family/team) from v1.** Full Supabase Auth, RLS on all tables, per-user devices and project registries. The spec's schema already models this; we do not take the single-user shortcut. **CONFIRMED**

3. **Backend hosting: Supabase, dedicated project.** Replit and Lovable evaluated and rejected for the core (Replit duplicates what Supabase provides; Lovable is web-only and cannot produce the native capture app). Lovable may optionally host a later admin dashboard but the admin-web belongs in this monorepo. → ADR-0002. **CONFIRMED**
   - 2026-07-18 (later): owner designated existing Supabase project `oqruqictijboujiuzqnf` as the backend. That project is in an org the connected Supabase MCP cannot access (verified: permission denied); access will come via a Supabase personal access token for the owning account (preferred, enables CLI) or by re-scoping the connector. **CONFIRMED — access pending**

4. **Transcription: OpenAI API.** Key to be supplied by owner. Structuring + routing adjudication: Claude API (existing subscription). Embeddings: Supabase built-in gte-small + pgvector (no external embeddings dependency). **CONFIRMED**

5. **Straight to native Android app** (owner choice; §27 MVP folder-watcher shortcut skipped). Kotlin + Jetpack Compose, signed APK sideloaded to Samsung S24. No Android Studio on the build PC — headless JDK 17 + Android command-line tools + Gradle toolchain will be installed by the agent during Phase 1. **CONFIRMED**

6. **Notifications:** FCM for the native app (free Firebase project); interim notifications during development via email/Slack which are already connected. **CONFIRMED**

7. **Agent runner host:** the owner's always-on Windows PC (24/7), invoking Claude Code headless (`claude -p` / Agent SDK) in isolated worktrees per §17 of the spec. **CONFIRMED**

8. **Repo:** private GitHub repo `segunosu/voice-inbox`, cloned at `C:\Users\Oem\Claude_CODE\voice-inbox`. Owner created the repo and a dedicated fine-grained PAT (2026-07-18); Phase 0 seed pushed. **DONE**

9. **Secrets policy:** no secrets in any Google-Drive-synced folder or in this repo. Canonical local-only store at `C:\Users\Oem\.secrets\` (one env file per project). See SECURITY.md. Pre-existing keys found in Drive-synced `.env.local` files are treated as exposed and scheduled for rotation. **CONFIRMED**
