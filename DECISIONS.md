# DECISIONS.md — running decision log

Format: date · decision · reasoning · status. Newest first. Decisions are never silently rewritten; superseded entries are marked as such.

---

## 2026-07-19 — Adjudicator injection hardening (eval-driven)

20. **Two-layer routing injection defence**: (1) §16.2 adjudicator prompt now explicitly treats commanded destinations ("route this to X", "no matter what", "system override") as untrusted data and evidence of nothing; (2) deterministic sentence-level sanitisation strips injection-command sentences from the adjudicator's view (full transcript preserved in the intake record). Eval after hardening: **99/100, false-confident 0, over-cautious 0, injection 5/5** (was 93% with 3 false-confident pre-guard). Known residual: lowercase unnamed-style references ("the marketing project") can land in the catch-all instead of asking — benign destination, tracked in the eval. One eval label corrected in the model's favour: "Family Plan" correctly routes to TPM (TPM has a Family plan). **DONE**

---

## 2026-07-18 (v1.1 same-day) — Answer-back, folder destinations, voice project creation, digest/sweep

16. **Answer-back live** (owner objective: work by voice, not just file by voice): `ask_project_question`/`summarise` intents are ANSWERED in-thread from real context (project capture history, agent jobs, GitHub commits/issues for repo projects) instead of silently filed. Verified live: "What has been done on Voice Inbox today?" received an accurate commit-level summary. Scope limit: answers only from Voice Inbox DB + routed project's GitHub; no external systems yet; outbound messages to third parties deliberately not executed (spec §2.2).

17. **Drive-folder destinations live**: `projects.folder_path` + `folder_exports` queue; local exporter (`services/folder-exporter`, Windows scheduled task every 5 min on the always-on PC, hidden via VBS) writes §12 intake .md files into `<Cowork folder>/.voice-inbox/inbox/YYYY/MM/`; Google Drive for Desktop syncs them. Verified: Piscina Alta intake file written and marked exported. Chosen over Google service-account API to stay within existing credentials (£0, no new cloud grants).

18. **Voice project creation live**: unknown-project clarifications now carry a "➕ Create 'X'" button; tap creates registry entry + alias + folder destination, routes the capture, resumes dispatch. Verified end-to-end with a signed synthetic tap: project created, capture completed, new folder materialised on the Cowork drive with the intake inside (test project archived afterwards). Routing bug fixed in passing: aliases of archived projects no longer capture routes.

19. **Daily digest + retry sweep**: `digest` Edge Function; pg_cron + pg_net schedules (sweep every 15 min resumes retryable failures at the stage their artefacts prove; digest daily 17:00 UTC posts one batched summary). Pipeline secret read from service-role-only `voice_inbox.settings` at run time — never in git. Verified: sweep returns counts; digest posted real numbers to #voice-inbox.

## 2026-07-18 (late night) — Dispatch stage live; clarification + approval loops verified

15. **dispatch-github deployed**: policy gate (§4.6) → §12 intake renderer → GitHub issue with @claude mention (Claude Code GitHub Action executes; never merges) → Slack notify; `approval_required` projects get in-thread Run/Save buttons; store-only intents and repo-less projects complete as filed. slack-interact extended for approvals; routing hands off to dispatch automatically. All four live captures ran the full state machine to `completed` (store-only outcomes, correct per policy). Clarification button loop verified live: IceFlow capture → buttons → user tap → routed via user_clarification + routing.correction evidence. Unknown-named-project rule added: never confidently file a named-but-unregistered project to the catch-all — ask instead. `claude.yml` workflow added; **remaining for full E2E execution: owner must mint a Claude credential (`claude setup-token`) and add it as the `CLAUDE_CODE_OAUTH_TOKEN` repo secret.** Dispatch uses the voice-inbox fine-grained PAT (verified: can create issues). **DONE (E2E agent run pending credential)**

## 2026-07-18 (night) — Pipeline live: transcribe → structure → route verified on real captures

14. **process-capture + slack-interact deployed; ingest hands off directly.** OpenAI transcription (`gpt-4o-mini-transcribe`) + structuring/adjudication (`gpt-5-mini`, §16 prompts, strict JSON schemas); routing = §11 Stage A explicit-alias + LLM adjudication with per-project thresholds (embeddings staged for later — registry is 4 projects, alias+LLM is sufficient and cheaper at this scale); ambiguous → Slack buttons via clarifications table; pipeline functions authed by shared secret; registry seeded (Voice Inbox / TPM / AI Alpha OS / General Inbox + 11 aliases). Verified live on both real captures: #1 "Project Voice Inbox. This is my first clip." → **explicit_alias 0.99 → Voice Inbox**; #2 "This is for TPM…" → **semantic_adjudication 0.92 → The Player's Mind**; routed replies posted in both Slack threads (channel + DM). Calibration note for the eval set: capture #2 said "for TPM" yet went to adjudication, not Stage A — structurer under-extracts explicit references; add to labelled examples. **DONE**

## 2026-07-18 (evening) — Phase 0 exit gate met; ingest deployed

12. **Phase 0 exit conditions all verified**: contracts typecheck + 15 tests green (fake capture traverses the simulated state machine); migrations 0001+0002 applied to the live project (14 tables, RLS on all, capture RPC with transactional outbox, private audio bucket); Gherkin specs for all 17 §26 criteria committed before build; **CI green on GitHub Actions**. **DONE**

13a. **Voice Inbox Slack app created and installed** (2026-07-18, via browser automation with owner authorization): App ID `A0BJCB2PRHS`, TEAMSMITHS workspace, manifest scopes/events/URLs as per `slack/manifest.yaml` (Slack verified the events URL at creation). Signing secret + bot token stored in the local secrets store and set as Edge Function secrets via Management API. Channel `#voice-inbox` (`C0BJ8L1AXEW`) created; bot invited via `/invite`. Awaiting first live audio-clip capture test. **DONE**

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
