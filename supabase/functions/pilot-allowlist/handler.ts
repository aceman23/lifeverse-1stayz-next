// Request handling for the pilot-allowlist function, kept free of Supabase imports so it can be
// tested with an in-memory store (handler_test.ts). index.ts wires it to the real table.
//
// Contract (the admin panel's edge function already calls it; keep it exactly as is):
//   POST, header x-allowlist-secret: <PILOT_ALLOWLIST_SECRET>
//   { "action": "add" | "remove", "email": string, "church_name"?: string, "source_ref"?: string }
//   add    -> 200 { status: "added" } | 200 { status: "already_present" }
//   remove -> 200 { status: "removed" } | 200 { status: "not_present" }
//             | 409 { error: "church_already_created" }
//   405 not POST, 503 secret not configured, 401 missing/wrong secret, 422 invalid body.

export interface AllowlistEntry {
  email: string;
  church_name: string | null;
  source_ref: string | null;
}

/** Storage for public.pilot_allowlist. Each method must be safe to call concurrently. */
export interface AllowlistStore {
  /** Inserts if absent. True if inserted, false if the email was already there. */
  insertIfAbsent(entry: AllowlistEntry): Promise<boolean>;
  /** Sets church_name / source_ref on an existing row only where they're empty. */
  fillEmpty(entry: AllowlistEntry): Promise<void>;
  /** Deletes the row if it hasn't been used. True if a row was deleted. */
  deleteUnused(email: string): Promise<boolean>;
  /** Whether a row exists for this email (used or not). */
  exists(email: string): Promise<boolean>;
}

export interface HandlerDeps {
  /** PILOT_ALLOWLIST_SECRET, read per request so a missing secret shows as 503, not a crash. */
  secret: () => string | undefined;
  store: () => AllowlistStore;
  log?: (entry: { action: string; result: string }) => void;
}

const MAX_EMAIL = 320;
const MAX_CHURCH_NAME = 200;
const MAX_SOURCE_REF = 100;
// Deliberately loose: one @, no spaces, a dot in the domain. The app's sign-up is the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (status: number, body: Record<string, string>, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

/** Compares SHA-256 digests so the time taken doesn't depend on where the strings differ. */
async function secretsMatch(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(given)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

type Parsed =
  | { ok: true; action: "add" | "remove"; entry: AllowlistEntry }
  | { ok: false; error: string };

/** Optional text field: absent/null/blank -> null; too long or not a string -> error. */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > max) return undefined;
  return trimmed || null;
}

function parseBody(body: unknown): Parsed {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;

  if (b.action !== "add" && b.action !== "remove") return { ok: false, error: "invalid_action" };

  if (typeof b.email !== "string") return { ok: false, error: "invalid_email" };
  const email = b.email.trim().toLowerCase();
  if (email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return { ok: false, error: "invalid_email" };

  const church_name = optionalText(b.church_name, MAX_CHURCH_NAME);
  if (church_name === undefined) return { ok: false, error: "invalid_church_name" };
  const source_ref = optionalText(b.source_ref, MAX_SOURCE_REF);
  if (source_ref === undefined) return { ok: false, error: "invalid_source_ref" };

  return { ok: true, action: b.action, entry: { email, church_name, source_ref } };
}

export function createHandler({ secret, store, log = (e) => console.log(JSON.stringify(e)) }: HandlerDeps) {
  return async function handle(req: Request): Promise<Response> {
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });

    const expected = secret();
    if (!expected) {
      log({ action: "unknown", result: "not_configured" });
      return json(503, { error: "not_configured" });
    }

    const given = req.headers.get("x-allowlist-secret");
    if (!given || !(await secretsMatch(given, expected))) {
      log({ action: "unknown", result: "unauthorized" });
      return json(401, { error: "unauthorized" });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      body = null;
    }
    const parsed = parseBody(body);
    if (!parsed.ok) {
      log({ action: "unknown", result: parsed.error });
      return json(422, { error: parsed.error });
    }

    const { action, entry } = parsed;
    try {
      const db = store();
      let status: string;
      if (action === "add") {
        if (await db.insertIfAbsent(entry)) {
          status = "added";
        } else {
          await db.fillEmpty(entry);
          status = "already_present";
        }
      } else if (await db.deleteUnused(entry.email)) {
        status = "removed";
      } else if (await db.exists(entry.email)) {
        // Only used rows survive deleteUnused: the church exists, so the approval stays.
        log({ action, result: "church_already_created" });
        return json(409, { error: "church_already_created" });
      } else {
        status = "not_present";
      }
      log({ action, result: status });
      return json(200, { status });
    } catch (err) {
      // The message comes from the database client and never includes the request body.
      console.error(JSON.stringify({ action, result: "error", message: err instanceof Error ? err.message : String(err) }));
      return json(500, { error: "internal_error" });
    }
  };
}
