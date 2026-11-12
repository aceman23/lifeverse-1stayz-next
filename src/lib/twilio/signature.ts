import "server-only";

import crypto from "node:crypto";

// X-Twilio-Signature check for form-encoded webhooks (ported from 1stayz-landing-page
// lib/twilio.js; that code is marketing-only and isn't called from here).
//
// Twilio signs base64(HMAC-SHA1(auth token, url + every param name and value, sorted by name)).
// A name sent more than once contributes each of its values, sorted.

export function expectedSignature(authToken: string, url: string, params: URLSearchParams): string {
  const names = [...new Set(params.keys())].sort();
  const data = url + names.map((n) => params.getAll(n).sort().map((v) => n + v).join("")).join("");
  return crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** True if `signature` matches any of the URLs the request may have been signed for. */
export function validSignature(
  authToken: string,
  signature: string | null,
  urls: string[],
  params: URLSearchParams,
): boolean {
  if (!authToken || !signature) return false;
  const got = Buffer.from(signature);
  return urls.some((url) => {
    const want = Buffer.from(expectedSignature(authToken, url, params));
    return want.length === got.length && crypto.timingSafeEqual(want, got);
  });
}
