/** Shared Slack helpers for Edge Functions. */

const encoder = new TextEncoder();

/**
 * Verifies Slack's request signature (v0 scheme) with a ±5 minute replay
 * window. Returns false on any missing input. Fail closed.
 */
export async function verifySlackSignature(
  signingSecret: string,
  body: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!signingSecret || !timestampHeader || !signatureHeader) return false;
  const ts = Number(timestampHeader);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false; // replay window

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`v0:${timestampHeader}:${body}`),
  );
  const expected =
    "v0=" +
    Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  // constant-time comparison
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

export async function slackApi(
  method: string,
  token: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!json.ok) {
    throw new Error(`Slack API ${method} failed: ${JSON.stringify(json.error)}`);
  }
  return json;
}

export async function postThreadReply(
  botToken: string,
  channel: string,
  threadTs: string,
  text: string,
  blocks?: unknown[],
): Promise<void> {
  await slackApi("chat.postMessage", botToken, {
    channel,
    thread_ts: threadTs,
    text,
    ...(blocks ? { blocks } : {}),
  });
}
