import { nudgeJob } from "@/lib/jobs/nudge";
import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { twilioConfig } from "@/lib/twilio/config";
import { validSignature } from "@/lib/twilio/signature";
import { log } from "@/lib/log";
import { recordSecurityEvent } from "@/lib/security/events";

// POST /api/twilio/conversations: the Conversations service's post-event webhook
// (onMessageAdded). A guest's text arrives on the conversation Twilio matched by the
// (guest number, church number) pair, and is recorded on the thread that owns that
// conversation. There's no separate raw incoming-SMS webhook (WP-3).
//
// Auth: X-Twilio-Signature with the auth token. The church and thread come from our own
// records of the conversation, never from the request. Logs carry SIDs and ids only.

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;


const reply = (status: number, error?: string) =>
  error ? NextResponse.json({ error }, { status }) : new NextResponse(null, { status });

/**
 * The URLs Twilio may have signed: TWILIO_WEBHOOK_URL when set (e.g. behind a tunnel),
 * else this request's public URL (from the proxy headers) and its own URL.
 */
function signedUrls(request: NextRequest): string[] {
  const configured = process.env.TWILIO_WEBHOOK_URL;
  if (configured) return [configured];
  const own = new URL(request.url);
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwarded = host ? `${proto || "https"}://${host}${own.pathname}${own.search}` : null;
  return [...new Set([forwarded, own.toString()].filter((u): u is string => Boolean(u)))];
}

export async function POST(request: NextRequest) {
  const { config, missing } = twilioConfig();
  const admin = createAdminClient();
  if (!config || !admin) {
    log("twilio.webhook_misconfigured", { missing: admin ? missing : [...missing, "SUPABASE_SERVICE_ROLE_KEY"] });
    return reply(503, "unavailable");
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, "too_large");
  const params = new URLSearchParams(raw);

  if (!validSignature(config.authToken, request.headers.get("x-twilio-signature"), signedUrls(request), params)) {
    log("twilio.webhook_rejected", { reason: "bad_signature" });
    await recordSecurityEvent(admin, "webhook_bad_signature", "twilio.conversations");
    return reply(403, "invalid_signature");
  }

  const event = params.get("EventType");
  const conversationSid = params.get("ConversationSid");
  const messageSid = params.get("MessageSid");

  // Only our account and service; anything else is acknowledged and ignored.
  if (params.get("AccountSid") !== config.accountSid || params.get("ChatServiceSid") !== config.conversationsServiceSid) {
    log("twilio.webhook_ignored", { reason: "other_service", conversation_sid: conversationSid });
    return reply(200);
  }
  if (event !== "onMessageAdded") return reply(200);
  // Guest texts only. Messages we post through the API (Source "API") come back here too.
  if (params.get("Source")?.toUpperCase() !== "SMS") return reply(200);

  let mediaCount = 0;
  try {
    const media = JSON.parse(params.get("Media") || "[]") as unknown;
    mediaCount = Array.isArray(media) ? media.length : 0;
  } catch {
    // No media list: count stays 0.
  }

  const { data, error } = await admin.rpc("twilio_inbound_message", {
    p_event: {
      conversation_sid: conversationSid,
      message_sid: messageSid,
      participant_sid: params.get("ParticipantSid"),
      author: params.get("Author"),
      body: params.get("Body"),
      date_created: params.get("DateCreated"),
      media_count: mediaCount,
    },
  });

  if (error) {
    if (error.code === "22023") {
      log("twilio.webhook_rejected", { reason: "invalid_event", conversation_sid: conversationSid });
      return reply(200); // malformed: retrying won't help
    }
    // Twilio retries on errors, and duplicates are ignored, so a retry is safe.
    log("twilio.inbound_error", { code: error.code, conversation_sid: conversationSid, message_sid: messageSid });
    return reply(500, "failed");
  }

  const result = data as { status: string; keyword?: string | null; thread_id?: string; message_id?: string; reply_id?: string | null };
  // HELP: send the church's help reply now rather than at the next cron run.
  if (result.reply_id) {
    after(async () => {
      try {
        await nudgeJob("messages");
      } catch (e) {
        log("twilio.help_reply_error", { thread_id: result.thread_id, message: e instanceof Error ? e.message : String(e) });
      }
    });
  }
  log(result.status === "unrouted" ? "twilio.inbound_unrouted" : "twilio.inbound", {
    status: result.status,
    keyword: result.keyword ?? undefined,
    conversation_sid: conversationSid,
    message_sid: messageSid,
    thread_id: result.thread_id,
    message_id: result.message_id,
  });
  // A guest message (not STOP/HELP): let the assistant look at it now rather than at the next cron run.
  if (result.status === "received" && !result.keyword) {
    after(async () => {
      try {
        await nudgeJob("agent");
      } catch (e) {
        log("twilio.agent_error", { thread_id: result.thread_id, message: e instanceof Error ? e.message : String(e) });
      }
    });
  }
  return reply(200);
}

export function GET() {
  return reply(405, "method_not_allowed");
}
