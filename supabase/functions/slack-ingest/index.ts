/**
 * slack-ingest — capture entry point (spec §13.1/§13.2 collapsed, ADR-0003).
 *
 * Receives Slack Events API deliveries. For messages carrying an audio file:
 *  1. ACK Slack within 3s (processing continues via EdgeRuntime.waitUntil);
 *  2. download the clip from Slack and archive it in the private bucket
 *     (audio is the immutable source artefact — spec §28);
 *  3. capture Slack's native transcript when present (free fast-path);
 *  4. insert the capture row (idempotent on channel+ts) + outbox event
 *     in one RPC, and acknowledge in-thread.
 *
 * Security: Slack signature verified on every request (fail closed) except
 * the initial url_verification handshake, which Slack sends when the app is
 * first created from the manifest — before a signing secret can be configured.
 * If SLACK_SIGNING_SECRET is unset, ONLY url_verification is served.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifySlackSignature, postThreadReply } from "../_shared/slack.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";
const BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") ?? "";
const AUDIO_BUCKET = Deno.env.get("AUDIO_BUCKET") ?? "voice-inbox-audio";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: "voice_inbox" },
});

interface SlackFile {
  id: string;
  mimetype?: string;
  filetype?: string;
  url_private_download?: string;
  url_private?: string;
  duration_ms?: number;
  transcription?: { status?: string; preview?: { content?: string } };
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function processAudioMessage(event: Record<string, unknown>): Promise<void> {
  const channel = event.channel as string;
  const ts = (event.ts ?? event.event_ts) as string;
  const slackUserId = event.user as string;
  const files = (event.files ?? []) as SlackFile[];
  const audio = files.find(
    (f) => f.mimetype?.startsWith("audio/") || f.filetype === "m4a" || f.filetype === "webm",
  );
  if (!audio || !channel || !ts || !slackUserId) return;

  // Idempotency gate first (§20.1): captures are unique on (channel, ts).
  const existing = await db
    .from("captures")
    .select("id")
    .eq("slack_channel_id", channel)
    .eq("slack_message_ts", ts)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return; // duplicate delivery — no side effects

  // Resolve (or create) the user from their Slack identity.
  const user = await db
    .from("users")
    .upsert({ slack_user_id: slackUserId }, { onConflict: "slack_user_id" })
    .select("id")
    .single();
  if (user.error) throw user.error;

  // Download the clip from Slack (bot token authorises url_private).
  const url = audio.url_private_download ?? audio.url_private;
  if (!url) throw new Error(`file ${audio.id} has no private URL`);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${BOT_TOKEN}` } });
  if (!res.ok) throw new Error(`audio download failed: HTTP ${res.status}`);
  const bytes = await res.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  const mime = audio.mimetype ?? "audio/mp4";

  const recordedAt = new Date(Number(ts.split(".")[0]) * 1000);
  const yyyy = recordedAt.getUTCFullYear();
  const mm = String(recordedAt.getUTCMonth() + 1).padStart(2, "0");
  const objectKey = `captures/${yyyy}/${mm}/${channel}_${ts.replace(".", "-")}_${audio.id}`;

  const upload = await db.storage.from(AUDIO_BUCKET).upload(objectKey, bytes, {
    contentType: mime,
    upsert: true, // same key ⇒ same source message ⇒ safe
  });
  if (upload.error) throw upload.error;

  const nativeTranscript =
    audio.transcription?.status === "complete"
      ? (audio.transcription.preview?.content ?? null)
      : null;

  // Capture row + outbox event atomically (transactional outbox, §20.2).
  const rpc = await db.rpc("create_capture_with_event", {
    p_user_id: user.data.id,
    p_channel: channel,
    p_ts: ts,
    p_idempotency_key: `slack:${channel}:${ts}`,
    p_audio_object_key: objectKey,
    p_audio_sha256: sha256,
    p_audio_mime_type: mime,
    p_duration_ms: audio.duration_ms ?? null,
    p_recorded_at: recordedAt.toISOString(),
    p_slack_native_transcript: nativeTranscript,
    p_slack_user_id: slackUserId,
  });
  if (rpc.error) throw rpc.error;

  if (BOT_TOKEN) {
    await postThreadReply(
      BOT_TOKEN,
      channel,
      ts,
      "🎙️ Got it — capture stored. Processing…",
    ).catch((e) => console.error("ack reply failed", e));
  }
}

Deno.serve(async (req) => {
  const body = await req.text();

  // Slack URL verification handshake (sent at app creation, pre-secret).
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  if (payload.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: payload.challenge }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Everything else requires a configured secret and a valid signature.
  const ok = await verifySlackSignature(
    SIGNING_SECRET,
    body,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
  );
  if (!ok) return new Response("invalid signature", { status: 401 });

  if (payload.type === "event_callback") {
    const event = payload.event as Record<string, unknown>;
    const isAudioMessage =
      event?.type === "message" &&
      event.subtype === "file_share" &&
      Array.isArray(event.files) &&
      (event.files as SlackFile[]).some(
        (f) => f.mimetype?.startsWith("audio/") || f.filetype === "m4a" || f.filetype === "webm",
      );
    if (isAudioMessage) {
      // ACK within 3s; heavy lifting continues in the background.
      EdgeRuntime.waitUntil(
        processAudioMessage(event).catch((e) => console.error("ingest failed", e)),
      );
    }
  }

  return new Response("ok");
});
