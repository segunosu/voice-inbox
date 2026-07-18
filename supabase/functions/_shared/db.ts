import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

export function voiceInboxDb(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { db: { schema: "voice_inbox" } },
  );
}

export async function transition(
  db: SupabaseClient,
  captureId: string,
  from: string,
  to: string,
  correlationId: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const res = await db
    .from("captures")
    .update({ status: to, updated_at: new Date().toISOString() })
    .eq("id", captureId)
    .eq("status", from) // optimistic guard: invalid transitions do nothing
    .select("id");
  if (res.error) throw res.error;
  const moved = (res.data?.length ?? 0) > 0;
  if (moved) {
    await db.from("audit_events").insert({
      aggregate_type: "capture",
      aggregate_id: captureId,
      event_type: `capture.status.${to}`,
      actor_type: "pipeline",
      correlation_id: correlationId,
      payload_json: payload,
    });
  }
  return moved;
}
