import "server-only";

import { emailConfig } from "@/lib/email/config";
import { sendEmail } from "@/lib/email/resend";
import { log, logError, logWarn, errorMessage } from "@/lib/log";
import { toE164 } from "@/lib/onboarding/validation";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/twilio/api";
import { twilioConfig } from "@/lib/twilio/config";
import { notificationText, type NotificationRow } from "./notify-text";
import { toSmsText } from "@/lib/onboarding/message";

// Sends the notifications the database queued (church_notifications): escalations to the
// church's escalation contacts (email) and team alerts phone (text), reminders after 15 minutes,
// and alerts to the 1Stayz on-call (OPS_ALERT_EMAIL). Runs every minute from the cron and right
// after an escalation. Failures retry (1, 2 minutes later), then stay "failed" in the table.

export interface NotifySummary {
  reminders: number;
  sent: number;
  failed: number;
  skipped: number;
}

export async function runNotifier({ limit = 25, signal }: { limit?: number; signal?: AbortSignal } = {}): Promise<NotifySummary> {
  const summary: NotifySummary = { reminders: 0, sent: 0, failed: 0, skipped: 0 };
  signal?.throwIfAborted();
  const admin = createAdminClient({ signal });
  if (!admin) return summary;

  const { data: reminded, error: rError } = await admin.rpc("queue_escalation_reminders", {});
  if (rError) throw new Error(`queue_escalation_reminders: ${rError.message}`);
  summary.reminders = (reminded as number | null) ?? 0;

  const { data, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error) throw new Error(`claim_notifications: ${error.message}`);
  const rows = (data ?? []) as NotificationRow[];
  if (rows.length === 0) return summary;

  const mail = emailConfig().config;
  const sms = twilioConfig().config;
  const email = mail ? { ...mail, signal } : null;
  const twilio = sms ? { ...sms, signal } : null;
  const appUrl = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const opsTo = process.env.OPS_ALERT_EMAIL?.trim() || null;

  const mark = async (id: string, status: "sent" | "failed" | "skipped", err: string | null = null) => {
    await admin.rpc("mark_notification", { p_id: id, p_status: status, p_error: err });
    summary[status === "sent" ? "sent" : status === "failed" ? "failed" : "skipped"]++;
  };

  for (const n of rows) {
    signal?.throwIfAborted();
    const to = n.audience === "ops" ? opsTo : n.to_address;
    if (!to) {
      logWarn("notify.no_address", { id: n.id, audience: n.audience, kind: n.kind });
      await mark(n.id, "skipped", n.audience === "ops" ? "no_ops_alert_email" : "no_address");
      continue;
    }
    const { subject, text } = notificationText(n, appUrl);
    try {
      if (n.channel === "sms") {
        if (!twilio) throw new Error("twilio_not_configured");
        // The team alerts phone is saved as typed in onboarding/Settings, e.g. "(970) 555-0177".
        const phone = toE164(to);
        if (!phone) {
          await mark(n.id, "skipped", "invalid_phone");
          continue;
        }
        await sendSms(twilio, phone, toSmsText(text));
      } else {
        if (!email) throw new Error("email_not_configured");
        await sendEmail(email, {
          from: `"1Stayz Alerts" <alerts@${email.domain}>`,
          to,
          replyTo: `no-reply@${email.domain}`,
          subject,
          text,
          html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`,
          headers: {},
          idempotencyKey: `notification-${n.id}`,
        });
      }
      await mark(n.id, "sent");
      log("notify.sent", { id: n.id, kind: n.kind, audience: n.audience, channel: n.channel, church_id: n.church_id, thread_id: n.thread_id });
    } catch (e) {
      const code = e instanceof Error && "code" in e && e.code != null ? `${e.name}_${String(e.code)}` : errorMessage(e).slice(0, 60);
      await mark(n.id, "failed", code);
      logError("notify.failed", { id: n.id, kind: n.kind, channel: n.channel, attempt: n.attempts, code });
    }
  }
  return summary;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
