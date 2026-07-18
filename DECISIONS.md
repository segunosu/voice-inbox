# DECISIONS.md — running decision log

Format: date · decision · reasoning · status. Newest first. Decisions are never silently rewritten; superseded entries are marked as such.

---

## 2026-07-18 — Project inception decisions (owner interview)

1. **No n8n.** All orchestration (§15 workflows in the spec) is implemented as Supabase Edge Functions driven by a transactional outbox + pg_cron dispatcher. Reasoning: owner already subscribes to Supabase; n8n would add a second host, second credential store and second failure domain for a system whose spec already mandates Postgres-as-truth with an outbox; workflow logic in TypeScript in git beats exported workflow JSON. → ADR-0001. **CONFIRMED**

2. **Multi-user (family/team) from v1.** Full Supabase Auth, RLS on all tables, per-user devices and project registries. The spec's schema already models this; we do not take the single-user shortcut. **CONFIRMED**

3. **Backend hosting: Supabase, dedicated project.** Replit and Lovable evaluated and rejected for the core (Replit duplicates what Supabase provides; Lovable is web-only and cannot produce the native capture app). Lovable may optionally host a later admin dashboard but the admin-web belongs in this monorepo. → ADR-0002. **CONFIRMED**
   - *Which Supabase org* is still open: owner proposed org `jwtkfokvqnjikoqkcxnj` believing a third project there is free; free-plan orgs cap at 2 active projects and Pro orgs bill ~$10/mo for additional compute, so this is being verified. New project in TEAMSMITHS_LOVABLE org confirmed at $10/month via API. **OPEN**

4. **Transcription: OpenAI API.** Key to be supplied by owner. Structuring + routing adjudication: Claude API (existing subscription). Embeddings: Supabase built-in gte-small + pgvector (no external embeddings dependency). **CONFIRMED**

5. **Straight to native Android app** (owner choice; §27 MVP folder-watcher shortcut skipped). Kotlin + Jetpack Compose, signed APK sideloaded to Samsung S24. No Android Studio on the build PC — headless JDK 17 + Android command-line tools + Gradle toolchain will be installed by the agent during Phase 1. **CONFIRMED**

6. **Notifications:** FCM for the native app (free Firebase project); interim notifications during development via email/Slack which are already connected. **CONFIRMED**

7. **Agent runner host:** the owner's always-on Windows PC (24/7), invoking Claude Code headless (`claude -p` / Agent SDK) in isolated worktrees per §17 of the spec. **CONFIRMED**

8. **Repo:** private GitHub repo `segunosu/voice-inbox`, cloned at `C:\Users\Oem\Claude_CODE\voice-inbox`. Existing fine-grained PATs cannot create repos (403, verified); owner to create the empty repo or a PAT with Administration:write, after which the prepared local repo is pushed. **OPEN — awaiting repo creation/PAT**

9. **Secrets policy:** no secrets in any Google-Drive-synced folder or in this repo. Canonical local-only store at `C:\Users\Oem\.secrets\` (one env file per project). See SECURITY.md. Pre-existing keys found in Drive-synced `.env.local` files are treated as exposed and scheduled for rotation. **CONFIRMED**
