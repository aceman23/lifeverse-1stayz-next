import "server-only";

import { composeEmail, fromAddress } from "@/lib/email/compose";
import { emailConfig, type EmailConfig } from "@/lib/email/config";
import { ResendError, sendEmail, sentMessageId } from "@/lib/email/resend";
import { createAdminClient } from "@/lib/supabase/admin";
import { recentMessages, sendConversationMessage, TwilioError } from "@/lib/twilio/api";
import { twilioConfig, type TwilioConfig } from "@/lib/twilio/config";
import { ensureConversation } from "@/lib/twilio/conversations";
import { log } from "@/lib/log";
import { toSmsText } from "@/lib/onboarding/message";

// The sender (WP-4 SMS, WP-5 email). Runs every minute from /api/cron/messages, and right away after intake and
// after a HELP text:
//   1. queue_first_contacts()  writes first contacts for new SMS threads (database rules).
//   2. claim_outbound_sms()    takes due, approved texts under a lease; the database re-checks
//                              the send gate (STOP, consent, do not contact, review) and quiet
//                              hours first.
//   3. Twilio / Resend         SMS goes to the visit's conversation; email goes from the church's
//                              name on the mail subdomain, threaded with the visit's earlier email.
//   4. mark_outbound_sent() / mark_outbound_failed()  record the outcome (retry, then alert).
// Logs carry ids and codes only.

export interface SendSummary {
  queued: number;
  sent: number;
  retrying: number;
  failed: number;
  /** Why a channel wasn't sent (not configured); its messages wait. */
  skipped?: string[];
}

interface Claimed {
  message_id: string;
  church_id: string;
  thread_id: string;
  body: string;
  conversation_sid: string | null;
  attempt: number;
  purpose: string | null;
  /** Email only: where and how to send it (from claim_outbound('email')). */
  email: {
    to: string;
    church_name: string;
    church_address: string;
    subject: string;
    reply_token: string;
    references: string[];
  } | null;
}

/** Twilio codes worth trying again: rate limits and Twilio-side errors. */
const isRetryable = (e: TwilioError) => e.status === 429 || e.status >= 500 || e.code === 20429;


type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

/** Queues first contacts and sends everything due. Safe to run from several places at once. */
export async function runSender({ batches = 4, batchSize = 25, signal }: { batches?: number; batchSize?: number; signal?: AbortSignal } = {}): Promise<SendSummary> {
  const summary: SendSummary = { queued: 0, sent: 0, retrying: 0, failed: 0 };
  signal?.throwIfAborted();
  const admin = createAdminClient({ signal });
  if (!admin) return { ...summary, skipped: ["SUPABASE_SERVICE_ROLE_KEY not set"] };

  const queued = await admin.rpc("queue_first_contacts");
  if (queued.error) throw new Error(`queue_first_contacts failed: ${queued.error.code}`);
  summary.queued = queued.data as number;

  // A channel that isn't configured is skipped; its messages stay queued until it is.
  const sms = twilioConfig();
  const mail = emailConfig();
  const skipped: string[] = [];
  if (!sms.config) skipped.push(`SMS: ${sms.missing.join(", ")} not set`);
  if (!mail.config) skipped.push(`email: ${mail.missing.join(", ")} not set`);
  if (skipped.length) summary.skipped = skipped;

  const channels: [string, (m: Claimed) => Promise<Outcome>][] = [];
  if (sms.config) channels.push(["sms", (m) => sendSms(admin, { ...sms.config, signal }, m)]);
  if (mail.config) channels.push(["email", (m) => sendMail(admin, { ...mail.config, signal }, m)]);

  for (const [channel, send] of channels) {
    for (let b = 0; b < batches; b++) {
      signal?.throwIfAborted();
      const { data, error } = await admin.rpc("claim_outbound", { p_channel: channel, p_limit: batchSize });
      if (error) throw new Error(`claim_outbound(${channel}) failed: ${error.code}`);
      const claimed = (data ?? []) as Claimed[];
      for (const m of claimed) {
        signal?.throwIfAborted();
        const outcome = await send(m);
        if (outcome === "sent") summary.sent++;
        else if (outcome === "retry") summary.retrying++;
        else summary.failed++;
      }
      if (claimed.length < batchSize) break;
    }
  }
  return summary;
}

type Outcome = "sent" | "retry" | "failed";

/** Records a failure (retry or final) and returns the outcome. */
async function recordFailure(admin: Admin, m: Claimed, reason: string, retryable: boolean): Promise<Outcome> {
  const { data, error } = await admin.rpc("mark_outbound_failed", {
    p_message_id: m.message_id,
    p_reason: reason,
    p_retryable: retryable,
  });
  if (error) throw new Error(`mark_outbound_failed failed: ${error.code}`);
  log("message.send_failed", { message_id: m.message_id, thread_id: m.thread_id, reason, outcome: data });
  return data === "retry" ? "retry" : "failed";
}

async function recordSent(admin: Admin, m: Claimed, providerId: string, at: string | null, channel: string): Promise<Outcome> {
  const { error } = await admin.rpc("mark_outbound_sent", {
    p_message_id: m.message_id,
    p_provider_id: providerId,
    ...(at ? { p_sent_at: at } : {}),
  });
  if (error) throw new Error(`mark_outbound_sent failed: ${error.code}`);
  log("message.sent", { message_id: m.message_id, thread_id: m.thread_id, channel, purpose: m.purpose, provider_id: providerId });
  return "sent";
}

/** Rate limits and Resend-side errors are worth another try; bad requests aren't. */
const isRetryableResend = (e: ResendError) => e.status === 429 || e.status >= 500;

async function sendMail(admin: Admin, cfg: EmailConfig, m: Claimed): Promise<Outcome> {
  const e = m.email;
  if (!e) return recordFailure(admin, m, "email_details_missing", false);
  try {
    const refs = e.references.filter(Boolean);
    const reply = `reply+${e.reply_token}@${cfg.domain}`;
    const unsubscribeUrl = `${cfg.appUrl}/api/email/unsubscribe?t=${e.reply_token}`;
    const { text, html } = composeEmail({
      churchName: e.church_name,
      churchAddress: e.church_address,
      body: m.body,
      unsubscribeUrl,
    });
    const id = await sendEmail(cfg, {
      from: fromAddress(e.church_name, cfg.fromLocal, cfg.domain),
      to: e.to,
      replyTo: reply,
      subject: refs.length ? `Re: ${e.subject.replace(/^re:\s*/i, "")}` : e.subject,
      text,
      html,
      headers: {
        ...(refs.length ? { "In-Reply-To": refs[refs.length - 1], References: refs.join(" ") } : {}),
        "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${reply}?subject=unsubscribe>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      // Same message, same key: a retry after a crash can't send it twice.
      idempotencyKey: `message-${m.message_id}`,
    });
    const outcome = await recordSent(admin, m, id, null, "email");

    // Its Message-ID, so replies thread to this visit. The email.sent webhook fills it in if
    // Resend hasn't assigned it yet.
    try {
      const messageId = await sentMessageId(cfg, id);
      if (messageId) await admin.rpc("set_email_message_id", { p_provider_id: id, p_email_message_id: messageId });
    } catch {
      // Left to the webhook.
    }
    return outcome;
  } catch (err) {
    if (err instanceof ResendError) return recordFailure(admin, m, `resend_${err.code}`.slice(0, 200), isRetryableResend(err));
    return recordFailure(admin, m, "network_error", true);
  }
}

async function sendSms(admin: Admin, cfg: TwilioConfig, m: Claimed): Promise<Outcome> {
  const fail = (reason: string, retryable: boolean) => recordFailure(admin, m, reason, retryable);
  const sent = (sid: string, at: string | null) => recordSent(admin, m, sid, at, "sms");

  try {
    let conversationSid = m.conversation_sid;
    if (!conversationSid) {
      const opened = await ensureConversation(m.thread_id, { signal: cfg.signal });
      if (!opened.ok) return fail(`no_conversation_${opened.reason}`, opened.reason === "not_configured");
      conversationSid = opened.conversationSid;
    }

    // A retry after a crash between Twilio accepting the message and us recording it: don't send twice.
    if (m.attempt > 1) {
      const earlier = (await recentMessages(cfg, conversationSid)).find((x) => {
        try {
          return (JSON.parse(x.attributes || "{}") as { message_id?: string }).message_id === m.message_id;
        } catch {
          return false;
        }
      });
      if (earlier) return sent(earlier.sid, earlier.date_created);
    }

    const msg = await sendConversationMessage(cfg, conversationSid, toSmsText(m.body), {
      message_id: m.message_id,
      thread_id: m.thread_id,
    });
    return sent(msg.sid, msg.date_created);
  } catch (e) {
    if (e instanceof TwilioError) return fail(`twilio_${e.code ?? e.status}`, isRetryable(e));
    // Network errors and timeouts: try again later.
    return fail("network_error", true);
  }
}
