import { nudgeJob } from "@/lib/jobs/nudge";
import { after, NextResponse, type NextRequest } from "next/server";
import { htmlToText, replyText } from "@/lib/email/compose";
import { emailConfig } from "@/lib/email/config";
import { receivedEmail } from "@/lib/email/resend";
import { validWebhook } from "@/lib/email/webhook";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { recordSecurityEvent } from "@/lib/security/events";

// POST /api/email/webhook: Resend's webhook (WP-5).
//   email.received                         a guest's reply: fetched, quoted history removed,
//                                          recorded on its thread (email_inbound_message).
//   email.sent                             the Message-ID of an email we sent (for threading).
//   email.delivered / bounced / complained delivery outcome (email_event).
// Auth: Svix signature with RESEND_WEBHOOK_SECRET. Logs carry ids only.

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;


const ok = () => new NextResponse(null, { status: 200 });

interface ResendEvent {
  type: string;
  data: { email_id?: string; message_id?: string | null };
}

export async function POST(request: NextRequest) {
  const { config, missing } = emailConfig();
  const admin = createAdminClient();
  if (!config || !admin) {
    log("email.webhook_misconfigured", { missing: admin ? missing : [...missing, "SUPABASE_SERVICE_ROLE_KEY"] });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const signed = validWebhook(
    config.webhookSecret,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    raw,
  );
  if (!signed) {
    log("email.webhook_rejected", { reason: "bad_signature" });
    await recordSecurityEvent(admin, "webhook_bad_signature", "resend.webhook");
    return NextResponse.json({ error: "invalid_signature" }, { status: 403 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(raw) as ResendEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const emailId = event.data?.email_id;
  if (!emailId) return ok();

  switch (event.type) {
    case "email.received":
      return received(emailId);
    case "email.sent": {
      if (event.data.message_id) {
        const { error } = await admin.rpc("set_email_message_id", {
          p_provider_id: emailId,
          p_email_message_id: event.data.message_id,
        });
        if (error && error.code !== "22023") return retryLater("set_email_message_id", error.code, emailId);
      }
      return ok();
    }
    case "email.delivered":
    case "email.bounced":
    case "email.complained": {
      const { data, error } = await admin.rpc("email_event", { p_provider_id: emailId, p_type: event.type.slice(6) });
      if (error) return retryLater("email_event", error.code, emailId);
      log("email.event", { type: event.type, email_id: emailId, result: data });
      return ok();
    }
    default:
      return ok();
  }

  async function received(id: string) {
    let email;
    try {
      email = await receivedEmail(config!, id);
    } catch (e) {
      return retryLater("receivedEmail", e instanceof Error ? e.name : "error", id);
    }
    const headers = Object.fromEntries(Object.entries(email.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const text = replyText(email.text?.trim() ? email.text : htmlToText(email.html ?? ""));

    const { data, error } = await admin!.rpc("email_inbound_message", {
      p_email: {
        provider_id: email.id,
        message_id: email.message_id,
        from: headers.from || email.from,
        to: [...(email.to ?? []), ...(email.cc ?? []), ...(email.received_for ?? [])],
        subject: email.subject,
        text,
        in_reply_to: headers["in-reply-to"] ?? null,
        references: headers.references ?? null,
        date: email.created_at,
      },
    });
    if (error) return retryLater("email_inbound_message", error.code, id);
    const result = data as { status: string; matched_by?: string; keyword?: string | null; thread_id?: string; message_id?: string };
    log(result.status === "unrouted" ? "email.inbound_unrouted" : "email.inbound", {
      status: result.status,
      matched_by: result.matched_by,
      keyword: result.keyword ?? undefined,
      email_id: id,
      thread_id: result.thread_id,
      message_id: result.message_id,
    });
    // A guest message: let the assistant look at it now rather than at the next cron run.
    if (result.status === "received" && !result.keyword) {
      after(async () => {
        try {
          await nudgeJob("agent");
        } catch (e) {
          log("email.agent_error", { thread_id: result.thread_id, message: e instanceof Error ? e.message : String(e) });
        }
      });
    }
    return ok();
  }

  // Resend retries non-2xx responses, and every handler is idempotent.
  function retryLater(step: string, code: string, id: string) {
    log("email.webhook_error", { step, code, email_id: id });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
