import { ESCALATION_REASON_LABEL } from "@/lib/inbox/types";

// The words in staff and on-call notifications. Pure, so it's unit-tested. Staff messages may use
// the guest's first name (they're the church's own team); on-call (1Stayz) messages never name
// the guest, only the church, the category and ids. Nothing the guest wrote is ever included.

export interface NotificationRow {
  id: string;
  church_id: string;
  church_name: string;
  thread_id: string | null;
  kind: "escalation" | "escalation_reminder" | "alert";
  audience: "staff" | "ops";
  channel: "email" | "sms";
  to_address: string | null;
  recipient_name: string | null;
  payload: { first_name?: string | null; reason?: string | null; flagged_by?: string; alert_kind?: string };
  attempts: number;
}

export interface NotificationText {
  subject: string;
  text: string;
}

const ALERT_LABEL: Record<string, string> = {
  send_failed: "A message couldn't be delivered",
  first_contact_late: "A first message will miss the 30-minute window",
  ai_budget_reached: "The church reached its daily AI budget; the assistant is paused until tomorrow",
  security_tenant_mismatch: "SECURITY: another church's data reached the assistant's context; nothing was sent to a model (runbook 5.6)",
};

export function notificationText(n: NotificationRow, appUrl: string): NotificationText {
  const link = n.thread_id ? `${appUrl}/conversations?thread=${n.thread_id}` : `${appUrl}/today`;
  const reason = (ESCALATION_REASON_LABEL[n.payload.reason ?? "other"] ?? "Needs a person").toLowerCase();

  if (n.audience === "ops") {
    if (n.kind === "alert") {
      const what = ALERT_LABEL[n.payload.alert_kind ?? ""] ?? `Alert: ${n.payload.alert_kind ?? "unknown"}`;
      return {
        subject: `[1Stayz] ${n.church_name}: ${what}`,
        text: [
          `${what}.`,
          `Church: ${n.church_name} (${n.church_id})`,
          n.thread_id ? `Thread: ${n.thread_id}` : null,
          n.payload.reason ? `Code: ${n.payload.reason}` : null,
          "",
          "Runbook: docs/1Stayz_Go_Live_Runbook.md",
        ]
          .filter((l) => l !== null)
          .join("\n"),
      };
    }
    return {
      subject: `[1Stayz] ${n.church_name}: escalation unanswered after 15 minutes`,
      text: [
        `A guest who needs a pastor (${reason}) hasn't had a reply from the church in 15 minutes.`,
        `Church: ${n.church_name} (${n.church_id})`,
        `Thread: ${n.thread_id}`,
        "",
        "Runbook: docs/1Stayz_Go_Live_Runbook.md (Escalation not answered)",
      ].join("\n"),
    };
  }

  const name = n.payload.first_name?.trim() || "A guest";
  const reminder = n.kind === "escalation_reminder";
  if (n.channel === "sms") {
    return {
      subject: "",
      text: reminder
        ? `1Stayz: ${name} is still waiting for a pastor (${reason}). Please reply: ${link}`
        : `1Stayz: ${name} needs a pastor (${reason}). Please reply within 15 min: ${link}`,
    };
  }
  return {
    subject: reminder ? `Still waiting: ${name} needs a pastor` : `${name} needs a pastor (${reason})`,
    text: [
      n.recipient_name ? `Hi ${n.recipient_name.split(/\s+/)[0]},` : "Hi,",
      "",
      reminder
        ? `${name} is still waiting for a reply from ${n.church_name} (${reason}). It's been more than 15 minutes.`
        : `${name} needs a person from ${n.church_name} to reply (${reason}). ${
            n.payload.flagged_by === "staff" ? "Someone on your team flagged it." : "The assistant flagged it and has stopped replying."
          }`,
      "",
      `Open the conversation: ${link}`,
      "",
      "Please reply within 15 minutes. Whoever replies first takes it; everyone on the escalation list got this email.",
      "",
      "— 1Stayz",
    ].join("\n"),
  };
}
