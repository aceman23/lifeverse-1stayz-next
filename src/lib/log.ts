// Server logs (guidelines §4.5): one JSON line per event, ids and codes only. Every server log goes
// through here; `npm run check:logs` (in CI) fails on console.* anywhere else in src/.
//
// As a backstop, fields that can hold guest data are redacted by name, and phone numbers and
// email addresses inside any string (e.g. a database error that quotes a value) are masked.

const REDACT_KEYS = new Set([
  "body",
  "text",
  "html",
  "content",
  "subject",
  "draft",
  "quote",
  "reply",
  "prompt",
  "to",
  "from",
  "phone",
  "mobile",
  "email",
  "address",
  "name",
  "first_name",
  "last_name",
  "full_name",
  "author",
]);

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// 10+ digits with optional separators, e.g. +1 (217) 555-0142. Ids like UUIDs and Twilio SIDs
// mix letters in, so they're left alone.
const PHONE = /(?<![\w-])\+?\(?\d[\d\s().-]{8,}\d(?![\w-])/g;
const MAX_STRING = 300;

export function scrubString(value: string): string {
  const masked = value.replace(EMAIL, "[email]").replace(PHONE, (m) => (m.replace(/\D/g, "").length >= 10 ? "[phone]" : m));
  return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}…` : masked;
}

export function scrub(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 4) return "[…]";
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) && v != null ? "[redacted]" : scrub(v, depth + 1);
  }
  return out;
}

type Level = "info" | "warn" | "error";

function write(level: Level, event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({ event, ...(scrub(fields) as Record<string, unknown>) });
  // The one place allowed to write to the console (see scripts/check-logs.mjs).
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = (event: string, fields: Record<string, unknown> = {}) => write("info", event, fields);
export const logWarn = (event: string, fields: Record<string, unknown> = {}) => write("warn", event, fields);
export const logError = (event: string, fields: Record<string, unknown> = {}) => write("error", event, fields);

/** An error's message for a log line (scrubbed when written). */
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
