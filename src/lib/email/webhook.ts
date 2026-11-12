import "server-only";

import crypto from "node:crypto";

// Resend signs webhooks with Svix: svix-signature holds one or more "v1,<base64>" entries, each
// base64(HMAC-SHA256(secret, "<svix-id>.<svix-timestamp>.<raw body>")), where the secret is the
// base64 part of "whsec_...". Timestamps older than 5 minutes are refused (replays).

const TOLERANCE_S = 5 * 60;

export function validWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowS = Math.floor(Date.now() / 1000),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > TOLERANCE_S) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(" ").some((entry) => {
    const [version, sig] = entry.split(",");
    if (version !== "v1" || !sig) return false;
    const got = Buffer.from(sig, "base64");
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}
