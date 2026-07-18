# ADR-0001: Supabase Edge Functions + transactional outbox instead of n8n

Date: 2026-07-18 · Status: Accepted

## Context

The v1.0 spec (§6, §15) proposed n8n as the integration orchestrator, with PostgreSQL as the source of truth and a transactional outbox. The owner already subscribes to Supabase (hosted Postgres, auth, object storage, Edge Functions, pg_cron, pgvector) and prefers not to run n8n if equivalent results are achievable with existing tools.

## Decision

All eight §15 workflows are implemented as **Supabase Edge Functions**, dispatched by the transactional outbox: a pg_cron-scheduled dispatcher (plus database webhooks for low latency) invokes one function per event type. Retries, dead-lettering and idempotency are implemented in owned TypeScript against the `outbox_events` table.

Embeddings for routing candidate retrieval use the Edge runtime's built-in **gte-small** model with **pgvector**, removing the external embeddings dependency entirely.

## Consequences

- One platform, one credential store, one failure domain; nothing extra to host or back up.
- Workflow logic is version-controlled TypeScript with unit tests, not exported workflow JSON.
- The spec's `automation/n8n/` tree is replaced by `supabase/functions/` + `services/outbox-dispatcher`.
- We give up n8n's visual editor and node library; acceptable — every workflow here is "event → HTTP call → validate → DB write → next event", which is plain code.
- Observability (§21) must be built into the functions (structured logs with correlation IDs) rather than inherited from n8n's execution UI.
