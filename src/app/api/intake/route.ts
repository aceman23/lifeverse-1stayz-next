import { nudgeJob } from "@/lib/jobs/nudge";
import { createHash } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { MAX_BODY_BYTES, parseIntakePayload, readIntakeKey } from "@/lib/intake/payload";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { recordSecurityEvent } from "@/lib/security/events";

// POST /api/intake: a connection card or Subsplash form becomes a guest, a visit and a thread
// with its first-contact deadline (service end + 30 min). Contract: README "Guest intake".
//
// Auth: the church's intake key (Settings > Integrations), as "Authorization: Bearer isk_..."
// or "X-Intake-Key: isk_...". The church comes from the key, never from the body.
// Responses never echo guest details, and logs carry ids only (guidelines 4.5).

export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });


export async function POST(request: NextRequest) {
  const key = readIntakeKey(request.headers.get("authorization"), request.headers.get("x-intake-key"));
  if (!key) return json(401, { error: "invalid_intake_key", message: "Send the church's intake key as 'Authorization: Bearer isk_…'." });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json(413, { error: "too_large", message: `Bodies are limited to ${MAX_BODY_BYTES} bytes.` });
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: "too_large", message: `Bodies are limited to ${MAX_BODY_BYTES} bytes.` });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_json", message: "The body must be JSON." });
  }

  const parsed = parseIntakePayload(body);
  if ("errors" in parsed) return json(422, { error: "invalid_payload", fields: parsed.errors });

  const admin = createAdminClient();
  if (!admin) {
    log("intake.misconfigured", { reason: "SUPABASE_SERVICE_ROLE_KEY not set" });
    return json(503, { error: "unavailable", message: "Intake isn't configured on this server." });
  }

  const keyHash = createHash("sha256").update(key, "utf8").digest("hex");
  const started = Date.now();
  const { data, error } = await admin.rpc("intake_guest", { p_key_hash: keyHash, p_payload: parsed.payload });

  if (error) {
    // Messages raised by intake_guest are written for the sender; others are internal.
    if (error.code === "28000") {
      await recordSecurityEvent(admin, "intake_bad_key", "api.intake");
      return json(401, { error: "invalid_intake_key", message: "This intake key is unknown or revoked." });
    }
    if (error.code === "P0002" && error.message.includes("no_service_schedule")) {
      log("intake.rejected", { reason: "no_service_schedule", key_prefix: key.slice(0, 12) });
      return json(422, { error: "no_service_schedule", message: "Add the church's service times in setup before sending guests." });
    }
    if (error.code === "22023") return json(422, { error: "invalid_payload", message: error.message });
    log("intake.error", { code: error.code, key_prefix: key.slice(0, 12) });
    return json(500, { error: "intake_failed", message: "Couldn't record this submission. It's safe to retry." });
  }

  const result = data as {
    status: "created" | "duplicate";
    person_id: string;
    visit_id: string;
    thread_id: string | null;
    match?: string;
    first_contact_due_at?: string | null;
    warnings?: string[];
  };
  log("intake.ok", {
    status: result.status,
    visit_id: result.visit_id,
    thread_id: result.thread_id,
    match: result.match,
    warnings: result.warnings,
    ms: Date.now() - started,
  });

  // Once the response is sent: open the guest's Twilio conversation (SMS threads only), then
  // queue and send anything due, so a guest who submits after the service doesn't wait for the
  // next cron run. Failures are retried by the cron; intake has still succeeded.
  const threadId = result.thread_id;
  if (result.status === "created" && threadId) {
    after(async () => {
      try {
        await nudgeJob("messages");
      } catch (e) {
        log("intake.sender_error", { thread_id: threadId, message: e instanceof Error ? e.message : String(e) });
      }
    });
  }
  return json(result.status === "created" ? 201 : 200, result);
}

export function GET() {
  return json(405, { error: "method_not_allowed", message: "POST a submission to this URL." });
}
