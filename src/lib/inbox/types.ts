import type { TodayItem } from "@/data/types";

// Shapes for the inbox (Conversations), Today and the person page's conversation card. The
// server reads them from church_inbox / church_messages (src/lib/inbox/server.ts); the demo
// workspace builds the same shapes from mock data (src/lib/inbox/demo.ts).

export type InboxChannel = "sms" | "email";

/** Why a thread needs someone now, highest first (church_inbox.attention). */
export type Attention = "escalation" | "review" | "draft_ready" | "replied" | "coming_back" | "at_risk" | "needs_follow_up";

export { ESCALATION_REASONS, ESCALATION_REASON_LABEL, ESCALATION_SLA_MIN } from "@/lib/domain/escalation";
export type { EscalationReason } from "@/lib/domain/escalation";

/** Longest staff text; Twilio's limit. */
export const MAX_SMS = 1600;
export const MAX_EMAIL = 10000;

/** A staff account that can sign in (church_members), for assigning conversations. */
export interface StaffAccount {
  id: string;
  name: string;
}

export interface InboxThread {
  id: string;
  personId: string;
  name: string;
  firstName: string;
  /** The channel first contact went out on. */
  channel: InboxChannel;
  status: "open" | "closed" | "opted_out";
  handledBy: "assistant" | "staff";
  attention: Attention | null;
  escalation: { at: string; reason: string; answeredAt: string | null } | null;
  assignedTo: string | null;
  heldCount: number;
  last: { from: "guest" | "assistant" | "staff"; body: string; at: string; status: string } | null;
  lastActivityAt: string;
  /** "First visit · Oct 25 · 11:00 AM service" */
  visitLabel: string;
}

export interface ThreadMessage {
  id: string;
  /** A turn, or a thread event shown as a centered line (takeover, escalation, STOP...). */
  kind: "message" | "event";
  from: "guest" | "assistant" | "staff" | "system";
  event: string | null;
  body: string | null;
  at: string;
  channel: "sms" | "email" | "app";
  /** held, approved, sent, delivered, failed, received, logged */
  status: string;
  authorName: string | null;
  failureReason: string | null;
}

export interface ThreadDetail extends InboxThread {
  messages: ThreadMessage[];
  phone: string | null;
  email: string | null;
  /** Latest consent per channel. */
  consent: { sms: boolean; email: boolean };
  needsReview: boolean;
  doNotContact: boolean;
  /** UI-07: summary and next step while an escalation is open. */
  escalationBrief?: { summary: string[]; next: { title: string; steps: string[] } } | null;
}

export interface InboxData {
  demo: boolean;
  threads: InboxThread[];
  staff: StaffAccount[];
  /** The signed-in staff member's account id (null in the demo). */
  me: string | null;
  /** Server time when read; relative times count from here. */
  now: string;
}

/** The person page's conversation card: the guest's latest thread. */
export interface PersonConversation {
  threadId: string;
  channel: InboxChannel;
  status: InboxThread["status"];
  handledBy: InboxThread["handledBy"];
  messages: ThreadMessage[];
  /** Other visits' threads. */
  otherThreads: number;
  /** Server time when read. */
  now: string;
}

export interface HealthRow {
  label: string;
  target: string;
  current: string;
  /** null when there's nothing to measure yet. */
  onTrack: boolean | null;
}

export interface TodayData {
  demo: boolean;
  items: TodayItem[];
  staff: StaffAccount[];
  me: { id: string | null; name: string };
  timezone: string;
  services: { id: string; time: string; name: string; sendBy: string }[];
  health: HealthRow[];
  activity: { id: string; at: string; action: string; detail: string }[];
  now: string;
}

/** Why the composer can't send on a channel right now, or null if it can. */
export function sendBlockedReason(t: ThreadDetail, channel: InboxChannel): string | null {
  if (t.status === "opted_out") return "This guest replied STOP, so nothing more can be sent on this conversation.";
  if (t.status === "closed") return "This conversation is closed.";
  if (t.doNotContact) return "This guest is marked do not contact.";
  if (t.needsReview) return "Confirm who this guest is first (open their profile): they may be the same person as another guest.";
  if (channel === "sms" && !t.phone) return "This guest has no mobile number.";
  if (channel === "email" && !t.email) return "This guest has no email address.";
  if (!t.consent[channel]) return channel === "sms" ? "This guest hasn't agreed to text messages." : "This guest hasn't agreed to email.";
  return null;
}

/** The channel the guest last wrote on, else the thread's. */
export function replyChannel(t: ThreadDetail): InboxChannel {
  for (let i = t.messages.length - 1; i >= 0; i--) {
    const m = t.messages[i]!;
    if (m.from === "guest" && m.kind === "message" && (m.channel === "sms" || m.channel === "email")) return m.channel;
  }
  return t.channel;
}

export const isUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
