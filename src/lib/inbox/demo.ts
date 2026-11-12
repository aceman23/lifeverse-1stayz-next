// The demo workspace's inbox and Today, built from the mock data in src/data so the demo shows
// the same screens as a real church. Nothing here is saved; the pages keep demo changes in
// memory.

import { NOW } from "@/data/clock";
import { CONVERSATIONS } from "@/data/conversations";
import { fullName, getPerson } from "@/data/people";
import { CURRENT_USER, STAFF, getStaff } from "@/data/staff";
import { AGENT_ACTIVITY, PILOT_HEALTH, THIS_SUNDAY, TODAY_ITEMS } from "@/data/today";
import type { Conversation, TodayItem } from "@/data/types";
import { formatShortDate } from "@/lib/format";
import type { Attention, InboxData, InboxThread, PersonConversation, ThreadDetail, ThreadMessage, TodayData } from "./types";

const DEMO_STAFF = STAFF.map((s) => ({ id: s.id, name: s.name }));

function visitLabelFor(personId: string) {
  const p = getPerson(personId);
  if (!p) return "";
  return `${p.visitCount > 1 ? `Visit ${p.visitCount}` : "First visit"} · ${formatShortDate(p.firstVisitAt)}`;
}

/** Today items with the guest attached (the page reads item.person). */
export function withPeople(items: TodayItem[]): TodayItem[] {
  return items.map((item) => {
    const p = item.personId ? getPerson(item.personId) : undefined;
    const thread = item.personId ? CONVERSATIONS.find((c) => c.personId === item.personId) : undefined;
    return {
      ...item,
      threadId: thread?.id,
      person: p ? { id: p.id, name: fullName(p), firstName: p.firstName, phone: p.phone, visitLabel: visitLabelFor(p.id) } : undefined,
    };
  });
}

function messagesOf(c: Conversation): ThreadMessage[] {
  const messages: ThreadMessage[] = c.messages.map((m) => ({
    id: `${c.id}-${m.id}`,
    kind: "message",
    from: m.from,
    event: null,
    body: m.body,
    at: m.at,
    channel: c.channel === "email" ? "email" : "sms",
    status: m.from === "guest" ? "received" : "delivered",
    authorName: m.from === "staff" ? (getStaff(m.authorId ?? "")?.name ?? "Staff member") : null,
    failureReason: null,
  }));
  // The demo's drafts waiting for approval sit at the end of their thread.
  const draft = TODAY_ITEMS.find((i) => i.status === "draft_ready" && !i.done && i.personId === c.personId && i.draft);
  if (draft) {
    messages.push({
      id: `${c.id}-draft`,
      kind: "message",
      from: "assistant",
      event: null,
      body: draft.draft!,
      at: draft.dueAt,
      channel: c.channel === "email" ? "email" : "sms",
      status: "held",
      authorName: null,
      failureReason: null,
    });
  }
  return messages;
}

function toThread(c: Conversation): InboxThread {
  const p = getPerson(c.personId)!;
  const messages = messagesOf(c);
  const sent = messages.filter((m) => m.status !== "held");
  const last = sent.at(-1);
  const staffReplied = c.messages.some((m) => m.from === "staff");
  const escalated = c.outcome === "escalated";
  const held = messages.filter((m) => m.status === "held").length;

  let attention: Attention | null = null;
  if (escalated && !staffReplied) attention = "escalation";
  else if (held) attention = "draft_ready";
  else if (c.status !== "ended" && last?.from === "guest") attention = "replied";
  else if (c.outcome === "follow_up") attention = "at_risk";

  const firstGuest = c.messages.find((m) => m.from === "guest" && m.flagged) ?? c.messages.find((m) => m.from === "guest");
  return {
    id: c.id,
    personId: p.id,
    name: fullName(p),
    firstName: p.firstName,
    channel: c.channel === "email" ? "email" : "sms",
    status: c.status === "ended" ? "closed" : "open",
    handledBy: c.status === "active" ? "assistant" : "staff",
    attention,
    escalation: escalated
      ? {
          at: firstGuest?.at ?? c.messages[0]!.at,
          reason: "care",
          answeredAt: staffReplied ? (c.messages.find((m) => m.from === "staff")?.at ?? null) : null,
        }
      : null,
    assignedTo: null,
    heldCount: held,
    last: last ? { from: last.from as "guest" | "assistant" | "staff", body: last.body ?? "", at: last.at, status: last.status } : null,
    lastActivityAt: messages.at(-1)?.at ?? NOW.toISOString(),
    visitLabel: visitLabelFor(p.id),
  };
}

export function demoInbox(): InboxData {
  return { demo: true, threads: CONVERSATIONS.map(toThread), staff: DEMO_STAFF, me: CURRENT_USER.id, now: NOW.toISOString() };
}

export function demoThread(id: string): ThreadDetail | null {
  const c = CONVERSATIONS.find((t) => t.id === id);
  if (!c) return null;
  const p = getPerson(c.personId)!;
  return {
    ...toThread(c),
    messages: messagesOf(c),
    phone: p.phone,
    email: p.email,
    consent: { sms: Boolean(p.phone), email: Boolean(p.email) },
    needsReview: false,
    doNotContact: false,
  };
}

export function demoPersonConversation(personId: string): PersonConversation | null {
  const c = CONVERSATIONS.find((t) => t.personId === personId);
  if (!c) return null;
  const t = toThread(c);
  return { threadId: c.id, channel: t.channel, status: t.status, handledBy: t.handledBy, messages: messagesOf(c), otherThreads: 0, now: NOW.toISOString() };
}

export function demoToday(): TodayData {
  return {
    demo: true,
    items: withPeople(TODAY_ITEMS),
    staff: DEMO_STAFF,
    me: { id: CURRENT_USER.id, name: CURRENT_USER.name },
    timezone: "America/Chicago",
    services: THIS_SUNDAY,
    health: PILOT_HEALTH,
    activity: AGENT_ACTIVITY,
    now: NOW.toISOString(),
  };
}
