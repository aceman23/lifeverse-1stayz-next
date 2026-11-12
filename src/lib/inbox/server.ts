import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TodayItem, TodayPerson } from "@/data/types";
import { getChurchSession, isDemoRequest } from "@/lib/church/server";
import { demoInbox, demoPersonConversation, demoThread, demoToday } from "./demo";
import { escalationBrief, type EscalationBrief, type EscalationSource } from "./escalation-brief";
import {
  ESCALATION_REASON_LABEL,
  isUuid,
  type Attention,
  type InboxData,
  type InboxThread,
  type PersonConversation,
  type HealthRow,
  type StaffAccount,
  type ThreadDetail,
  type TodayData,
  type ThreadMessage,
} from "./types";

// Reads for the inbox, Today and the person page. RLS limits every row to the caller's church;
// the church id comes from the session and is also applied as a filter. Message bodies go to
// signed-in staff only and are never logged.

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------
interface InboxRow {
  thread_id: string;
  person_id: string;
  channel: "sms" | "email";
  status: "open" | "closed" | "opted_out";
  handled_by: "assistant" | "staff";
  escalated_at: string | null;
  escalation_reason: string | null;
  escalated_by: string | null;
  escalation_answered_at: string | null;
  assigned_to: string | null;
  followup_state: "done" | "not_priority" | null;
  followup_reason: string | null;
  followup_at: string | null;
  coming_back_on: string | null;
  last_event_at: string | null;
  created_at: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  needs_review: boolean;
  do_not_contact: boolean;
  visit_count: number;
  visited_at: string;
  service_name: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_message_sender: "guest" | "assistant" | "staff" | null;
  last_message_body: string | null;
  last_message_at: string | null;
  last_message_status: string | null;
  held_count: number;
  held_message_id: string | null;
  attention: Attention | null;
}

const INBOX_SELECT = `thread_id, person_id, channel, status, handled_by, escalated_at, escalation_reason, escalated_by,
  escalation_answered_at, assigned_to, followup_state, followup_reason, followup_at, coming_back_on, last_event_at, created_at,
  first_name, last_name, phone, email, needs_review, do_not_contact, visit_count, visited_at, service_name,
  last_inbound_at, last_outbound_at, last_message_sender, last_message_body, last_message_at, last_message_status,
  held_count, held_message_id, attention`;

interface MessageRow {
  id: string;
  event_type: string;
  direction: "inbound" | "outbound" | "internal";
  sender: "guest" | "assistant" | "staff" | "system";
  sender_user_id: string | null;
  channel: "sms" | "email" | "app";
  body: string | null;
  status: string;
  event_at: string;
  failure_reason: string | null;
}

const shortDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });

const fullName = (r: { first_name: string; last_name: string }) => `${r.first_name} ${r.last_name}`.trim();

function visitLabel(r: InboxRow) {
  const visit = r.visit_count > 1 ? `Visit ${r.visit_count}` : "First visit";
  return [visit, shortDate.format(new Date(r.visited_at)), r.service_name].filter(Boolean).join(" · ");
}

function toThread(r: InboxRow): InboxThread {
  return {
    id: r.thread_id,
    personId: r.person_id,
    name: fullName(r),
    firstName: r.first_name,
    channel: r.channel,
    status: r.status,
    handledBy: r.handled_by,
    attention: r.attention,
    escalation: r.escalated_at
      ? { at: r.escalated_at, reason: r.escalation_reason ?? "other", answeredAt: r.escalation_answered_at }
      : null,
    assignedTo: r.assigned_to,
    heldCount: r.held_count,
    last:
      r.last_message_sender && r.last_message_at
        ? { from: r.last_message_sender, body: r.last_message_body ?? "", at: r.last_message_at, status: r.last_message_status ?? "" }
        : null,
    lastActivityAt: r.last_event_at ?? r.created_at,
    visitLabel: visitLabel(r),
  };
}

async function staffAccounts(supabase: SupabaseClient, churchId: string): Promise<StaffAccount[]> {
  const { data, error } = await supabase
    .from("church_members")
    .select("user_id, full_name")
    .eq("church_id", churchId)
    .order("created_at")
    .returns<{ user_id: string; full_name: string | null }[]>();
  if (error) throw new Error(`Couldn't load your team: ${error.message}`);
  return (data ?? []).map((m) => ({ id: m.user_id, name: m.full_name?.trim() || "Staff member" }));
}

function toMessage(m: MessageRow, names: Map<string, string>): ThreadMessage {
  return {
    id: m.id,
    kind: m.event_type === "message" ? "message" : "event",
    from: m.sender,
    event: m.event_type === "message" ? null : m.event_type,
    body: m.body,
    at: m.event_at,
    channel: m.channel,
    status: m.status,
    authorName: m.sender_user_id ? (names.get(m.sender_user_id) ?? "Staff member") : null,
    failureReason: m.failure_reason,
  };
}

async function threadMessages(supabase: SupabaseClient, churchId: string, threadId: string, names: Map<string, string>) {
  const { data, error } = await supabase
    .from("church_messages")
    .select("id, event_type, direction, sender, sender_user_id, channel, body, status, event_at, failure_reason")
    .eq("church_id", churchId)
    .eq("thread_id", threadId)
    // Drafts the assistant hasn't offered yet and discarded messages never reached the guest.
    .not("status", "in", "(draft,discarded)")
    .order("event_at")
    .order("seq")
    .limit(500)
    .returns<MessageRow[]>();
  if (error) throw new Error(`Couldn't load this conversation: ${error.message}`);
  return (data ?? []).map((m) => toMessage(m, names));
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------
export type InboxResult = { kind: "ok"; inbox: InboxData } | { kind: "no-church" };

export async function listInbox(): Promise<InboxResult> {
  if (await isDemoRequest()) return { kind: "ok", inbox: demoInbox() };
  const session = await getChurchSession();
  if (!session) return { kind: "no-church" };
  const { supabase, churchId, userId } = session;

  const [rows, staff] = await Promise.all([
    supabase
      .from("church_inbox")
      .select(INBOX_SELECT)
      .eq("church_id", churchId)
      .order("last_event_at", { ascending: false, nullsFirst: false })
      .limit(300)
      .returns<InboxRow[]>(),
    staffAccounts(supabase, churchId),
  ]);
  if (rows.error) throw new Error(`Couldn't load your conversations: ${rows.error.message}`);
  return {
    kind: "ok",
    inbox: { demo: false, threads: (rows.data ?? []).map(toThread), staff, me: userId, now: new Date().toISOString() },
  };
}

/** One conversation with its transcript, or null (also for another church's id). */
export async function getThread(id: string): Promise<ThreadDetail | null> {
  if (await isDemoRequest()) return demoThread(id);
  if (!isUuid(id)) return null;
  const session = await getChurchSession();
  if (!session) return null;
  const { supabase, churchId } = session;

  const { data: row, error } = await supabase
    .from("church_inbox")
    .select(INBOX_SELECT)
    .eq("church_id", churchId)
    .eq("thread_id", id)
    .maybeSingle<InboxRow>();
  if (error) throw new Error(`Couldn't load this conversation: ${error.message}`);
  if (!row) return null;

  const [staff, consents] = await Promise.all([
    staffAccounts(supabase, churchId),
    supabase
      .from("church_consents")
      .select("channel, status, event_at")
      .eq("church_id", churchId)
      .eq("person_id", row.person_id)
      .order("event_at", { ascending: false })
      .returns<{ channel: "sms" | "email"; status: "granted" | "revoked"; event_at: string }[]>(),
  ]);
  const names = new Map(staff.map((s) => [s.id, s.name]));
  const [messages, briefs] = await Promise.all([
    threadMessages(supabase, churchId, id, names),
    row.escalated_at && !row.escalation_answered_at
      ? escalationBriefs(supabase, churchId, [row], names)
      : Promise.resolve(new Map<string, EscalationBrief>()),
  ]);
  const latest = (channel: "sms" | "email") => (consents.data ?? []).find((c) => c.channel === channel)?.status === "granted";

  return {
    ...toThread(row),
    messages,
    phone: row.phone,
    email: row.email,
    consent: { sms: latest("sms"), email: latest("email") },
    needsReview: row.needs_review,
    doNotContact: row.do_not_contact,
    escalationBrief: briefs.get(row.thread_id) ?? null,
  };
}

/** The guest's latest conversation for the person page, or null if they have none. */
export async function getPersonConversation(personId: string, demo: boolean): Promise<PersonConversation | null> {
  if (demo) return demoPersonConversation(personId);
  if (!isUuid(personId)) return null;
  const session = await getChurchSession();
  if (!session) return null;
  const { supabase, churchId } = session;

  const { data, error } = await supabase
    .from("church_threads")
    .select("id, channel, status, handled_by, created_at")
    .eq("church_id", churchId)
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .returns<{ id: string; channel: "sms" | "email"; status: InboxThread["status"]; handled_by: InboxThread["handledBy"] }[]>();
  if (error) throw new Error(`Couldn't load this guest's conversation: ${error.message}`);
  const latest = data?.[0];
  if (!latest) return null;

  const staff = await staffAccounts(supabase, churchId);
  const messages = await threadMessages(supabase, churchId, latest.id, new Map(staff.map((s) => [s.id, s.name])));
  return {
    threadId: latest.id,
    channel: latest.channel,
    status: latest.status,
    handledBy: latest.handled_by,
    messages,
    otherThreads: (data?.length ?? 1) - 1,
    now: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------
export type TodayResult = { kind: "ok"; today: TodayData } | { kind: "no-church" };

const ACTIVITY_LABEL: Record<string, string> = {
  "intake.received": "New guest from intake",
  "first_contact.queued": "First message written",
  "message.sent": "Message sent",
  "message.failed": "Message failed",
  "message.blocked": "Send blocked",
  "message.received": "Guest replied",
  "email.received": "Guest replied by email",
  "message.approved": "Draft approved",
  "message.discarded": "Draft discarded",
  "message.staff_reply": "Staff replied",
  "thread.escalated": "Marked as needing a pastor",
  "escalation.answered": "Escalation answered",
  "thread.taken_over": "Staff took over",
  "thread.released": "Handed back to the assistant",
  "consent.revoked": "Guest opted out",
  "consent.granted": "Guest opted in",
};

// Service times are wall-clock times; timeOn() puts them on a UTC date, so format in UTC.
const wallClock = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "numeric", minute: "2-digit" });

function median(values: number[]) {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Start of today in the church's time zone, as an instant. */
function startOfToday(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const since = ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second")) * 1000;
  return new Date(now.getTime() - since - now.getMilliseconds());
}

function personOf(r: InboxRow): TodayPerson {
  return { id: r.person_id, name: fullName(r), firstName: r.first_name, phone: r.phone, visitLabel: visitLabel(r) };
}

function daysSince(iso: string | null, now: Date) {
  return iso ? Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)) : 0;
}

export async function getToday(): Promise<TodayResult> {
  if (await isDemoRequest()) return { kind: "ok", today: demoToday() };
  const session = await getChurchSession();
  if (!session) return { kind: "no-church" };
  const { supabase, churchId, userId } = session;
  const now = new Date();

  const { data: church, error: churchError } = await supabase
    .from("churches")
    .select("timezone, church_services (client_id, name, day, start_time, end_time, position)")
    .eq("id", churchId)
    .maybeSingle<{
      timezone: string;
      church_services: { client_id: string; name: string; day: string | null; start_time: string | null; end_time: string | null; position: number }[];
    }>();
  if (churchError || !church) throw new Error(`Couldn't load your church: ${churchError?.message ?? "not found"}`);
  const tz = church.timezone || "America/Chicago";
  const dayStart = startOfToday(tz, now);

  const [open, doneRows, alerts, staff, audit] = await Promise.all([
    supabase
      .from("church_inbox")
      .select(INBOX_SELECT)
      .eq("church_id", churchId)
      .in("attention", ["escalation", "review", "draft_ready", "replied", "coming_back", "at_risk"])
      .limit(200)
      .returns<InboxRow[]>(),
    supabase
      .from("church_inbox")
      .select(INBOX_SELECT)
      .eq("church_id", churchId)
      .not("followup_state", "is", null)
      .gte("followup_at", dayStart.toISOString())
      .limit(50)
      .returns<InboxRow[]>(),
    supabase
      .from("church_alerts")
      .select("id, thread_id, kind, details, created_at")
      .eq("church_id", churchId)
      .is("resolved_at", null)
      .order("created_at")
      .limit(50)
      .returns<{ id: string; thread_id: string | null; kind: "first_contact_late" | "send_failed" | "ai_budget_reached"; details: { reason?: string }; created_at: string }[]>(),
    staffAccounts(supabase, churchId),
    supabase
      .from("church_audit_log")
      .select("id, thread_id, action, actor_user_id, created_at")
      .eq("church_id", churchId)
      .in("action", Object.keys(ACTIVITY_LABEL))
      .order("created_at", { ascending: false })
      .limit(8)
      .returns<{ id: number; thread_id: string | null; action: string; actor_user_id: string | null; created_at: string }[]>(),
  ]);
  for (const r of [open, doneRows, alerts, audit]) if (r.error) throw new Error(`Couldn't load Today: ${r.error.message}`);

  const rows = open.data ?? [];
  const names = new Map(staff.map((s) => [s.id, s.name]));

  // Threads the alerts and the activity feed point at, for guest names.
  const known = new Map<string, InboxRow>([...rows, ...(doneRows.data ?? [])].map((r) => [r.thread_id, r]));
  const missing = [
    ...new Set([...(alerts.data ?? []).map((a) => a.thread_id), ...(audit.data ?? []).map((a) => a.thread_id)].filter(
      (id): id is string => Boolean(id) && !known.has(id!),
    )),
  ];
  if (missing.length) {
    const { data } = await supabase.from("church_inbox").select(INBOX_SELECT).eq("church_id", churchId).in("thread_id", missing).returns<InboxRow[]>();
    for (const r of data ?? []) known.set(r.thread_id, r);
  }

  // Drafts' text and the last guest message on escalations.
  const heldIds = rows.map((r) => r.held_message_id).filter((id): id is string => Boolean(id));
  const escalated = rows.filter((r) => r.attention === "escalation").map((r) => r.thread_id);
  const [held, guestLines, people] = await Promise.all([
    heldIds.length
      ? supabase.from("church_messages").select("id, body, channel").eq("church_id", churchId).in("id", heldIds).returns<{ id: string; body: string; channel: "sms" | "email" }[]>()
      : Promise.resolve({ data: [] as { id: string; body: string; channel: "sms" | "email" }[] }),
    escalated.length
      ? supabase
          .from("church_messages")
          .select("thread_id, body, event_at")
          .eq("church_id", churchId)
          .in("thread_id", escalated)
          .eq("direction", "inbound")
          .eq("event_type", "message")
          .order("event_at", { ascending: false })
          .limit(100)
          .returns<{ thread_id: string; body: string; event_at: string }[]>()
      : Promise.resolve({ data: [] as { thread_id: string; body: string; event_at: string }[] }),
    escalated.length
      ? supabase
          .from("church_people")
          .select("id, interests")
          .eq("church_id", churchId)
          .in("id", rows.filter((r) => r.attention === "escalation").map((r) => r.person_id))
          .returns<{ id: string; interests: string[] }[]>()
      : Promise.resolve({ data: [] as { id: string; interests: string[] }[] }),
  ]);
  const briefs = await escalationBriefs(supabase, churchId, rows.filter((r) => r.attention === "escalation"), names);
  const heldById = new Map((held.data ?? []).map((m) => [m.id, m]));
  const lastGuestLine = new Map<string, string>();
  for (const m of guestLines.data ?? []) if (!lastGuestLine.has(m.thread_id)) lastGuestLine.set(m.thread_id, m.body);
  const interests = new Map((people.data ?? []).map((p) => [p.id, p.interests]));

  const base = (r: InboxRow): Pick<TodayItem, "personId" | "person" | "threadId" | "channel" | "assignedTo"> => ({
    personId: r.person_id,
    person: personOf(r),
    threadId: r.thread_id,
    channel: r.channel,
    assignedTo: r.assigned_to,
  });

  const items: TodayItem[] = [];
  for (const r of rows) {
    const id = `${r.attention}:${r.thread_id}`;
    switch (r.attention) {
      case "escalation": {
        const reason = ESCALATION_REASON_LABEL[r.escalation_reason ?? "other"] ?? "Needs a person";
        const by = r.escalated_by ? names.get(r.escalated_by) : null;
        items.push({
          ...base(r),
          id,
          status: "escalation",
          detail: `${reason}. The assistant is paused until someone replies.`,
          quote: lastGuestLine.get(r.thread_id),
          summary: `${by ? `${by} marked this` : "The assistant flagged this"} as needing a pastor: ${reason.toLowerCase()}.`,
          why: `${
            by ? `${by} marked this conversation` : `The assistant read ${r.first_name}'s message and flagged it`
          } as "${reason}". The assistant has stopped replying, and it stays on top of Today until someone on your team answers ${r.first_name}.`,
          chips: [r.visit_count > 1 ? `Visit ${r.visit_count}` : "First visit", ...(interests.get(r.person_id) ?? []).slice(0, 3)],
          dueAt: r.escalated_at!,
          brief: briefs.get(r.thread_id),
        });
        break;
      }
      case "review":
        items.push({
          ...base(r),
          id,
          status: "review",
          detail: "May be the same person as another guest. Nothing is sent until you confirm who this is.",
          meta: visitLabel(r),
          dueAt: r.created_at,
        });
        break;
      case "draft_ready": {
        const draft = r.held_message_id ? heldById.get(r.held_message_id) : undefined;
        items.push({
          ...base(r),
          id,
          status: "draft_ready",
          detail: r.last_outbound_at ? "The assistant wrote a reply and is waiting for your OK." : "First message is ready and waiting for your OK.",
          meta: `${visitLabel(r)}${r.held_count > 1 ? ` · ${r.held_count} drafts` : ""}`,
          draft: draft?.body,
          channel: draft?.channel ?? r.channel,
          messageId: r.held_message_id ?? undefined,
          dueAt: r.last_message_at ?? r.created_at,
        });
        break;
      }
      case "replied":
        items.push({
          ...base(r),
          id,
          status: "replied",
          detail: r.last_message_sender === "guest" && r.last_message_body ? `“${truncate(r.last_message_body, 140)}”` : `${r.first_name} replied.`,
          meta: `${visitLabel(r)} · ${r.handled_by === "assistant" ? "Waiting for a reply" : "Your team is handling this"}`,
          dueAt: r.last_inbound_at ?? r.created_at,
        });
        break;
      case "at_risk": {
        const days = daysSince(r.last_outbound_at, now);
        items.push({
          ...base(r),
          id,
          status: "needs_follow_up",
          detail: `No reply in ${days} days. A personal call from someone on your team often helps here.`,
          meta: visitLabel(r),
          dueAt: r.last_outbound_at ?? r.created_at,
        });
        break;
      }
      case "coming_back":
        items.push({
          ...base(r),
          id,
          status: "upcoming",
          detail: `Said they're coming back${r.coming_back_on ? ` on ${formatDateOnly(r.coming_back_on)}` : ""}. Let your greeters know.`,
          meta: visitLabel(r),
          dueAt: r.coming_back_on ? `${r.coming_back_on}T12:00:00Z` : r.created_at,
        });
        break;
    }
  }

  for (const a of alerts.data ?? []) {
    const r = a.thread_id ? known.get(a.thread_id) : undefined;
    items.push({
      id: `alert:${a.id}`,
      status: "alert",
      alertId: a.id,
      personId: r?.person_id ?? null,
      person: r ? personOf(r) : undefined,
      threadId: a.thread_id ?? undefined,
      title: r ? undefined : a.kind === "ai_budget_reached" ? "Assistant paused" : "Messaging",
      channel: r?.channel,
      detail:
        a.kind === "first_contact_late"
          ? a.details?.reason === "quiet_hours"
            ? "First message is held by quiet hours and will go out after the 30-minute window. Consider reaching out personally."
            : "First message couldn't go out within 30 minutes of the service."
          : a.kind === "ai_budget_reached"
            ? "Your church reached today's AI budget, so the assistant is paused until tomorrow. Guests who need a pastor are still flagged; reply to the others yourself."
            : "A message couldn't be delivered. Check the number or email, or reach out another way.",
      dueAt: a.created_at,
    });
  }

  // Oldest first within each kind (escalations especially).
  items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

  for (const r of doneRows.data ?? []) {
    if (items.some((i) => i.threadId === r.thread_id)) continue;
    items.push({
      ...base(r),
      id: `done:${r.thread_id}`,
      status: "replied",
      detail: r.followup_state === "not_priority" ? `Not a priority${r.followup_reason ? `: ${r.followup_reason}` : ""}` : "Marked done",
      dueAt: r.followup_at!,
      done: true,
    });
  }

  const me = staff.find((s) => s.id === userId);
  const services = [...(church.church_services ?? [])]
    .filter((s) => s.start_time && s.end_time)
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      id: s.client_id,
      time: wallClock.format(timeOn(s.start_time!)),
      name: [s.day, s.name].filter(Boolean).join(" · "),
      sendBy: wallClock.format(new Date(timeOn(s.end_time!).getTime() + 30 * 60_000)),
    }));

  return {
    kind: "ok",
    today: {
      demo: false,
      items,
      staff,
      me: { id: userId, name: me?.name ?? "" },
      timezone: tz,
      services,
      health: await pilotHealth(supabase, churchId),
      activity: (audit.data ?? []).map((a) => {
        const r = a.thread_id ? known.get(a.thread_id) : undefined;
        const who = a.actor_user_id ? names.get(a.actor_user_id) : null;
        return {
          id: String(a.id),
          at: a.created_at,
          action: ACTIVITY_LABEL[a.action] ?? a.action,
          detail: [r ? fullName(r) : null, who ? `by ${who}` : null].filter(Boolean).join(" · ") || "—",
        };
      }),
      now: now.toISOString(),
    },
  };
}

/**
 * UI-07: a summary and next step for each escalated thread, from facts only (who flagged it and
 * how, visit, interests, household, how often the guest wrote, earlier escalations). No guest words.
 */
async function escalationBriefs(
  supabase: SupabaseClient,
  churchId: string,
  rows: InboxRow[],
  names: Map<string, string>,
): Promise<Map<string, EscalationBrief>> {
  const escalated = rows.filter((r) => r.escalated_at);
  const out = new Map<string, EscalationBrief>();
  if (escalated.length === 0) return out;
  const threadIds = escalated.map((r) => r.thread_id);
  const personIds = [...new Set(escalated.map((r) => r.person_id))];

  const [audit, inbound, people, household, earlier] = await Promise.all([
    supabase
      .from("church_audit_log")
      .select("thread_id, actor_type, details, created_at")
      .eq("church_id", churchId)
      .eq("action", "thread.escalated")
      .in("thread_id", threadIds)
      .order("created_at", { ascending: false })
      .limit(500)
      .returns<{ thread_id: string; actor_type: string; details: { source?: string } | null; created_at: string }[]>(),
    supabase
      .from("church_messages")
      .select("thread_id")
      .eq("church_id", churchId)
      .in("thread_id", threadIds)
      .eq("direction", "inbound")
      .eq("event_type", "message")
      .limit(5000)
      .returns<{ thread_id: string }[]>(),
    supabase.from("church_people").select("id, interests").eq("church_id", churchId).in("id", personIds).returns<{ id: string; interests: string[] }[]>(),
    supabase.from("church_household_members").select("person_id").eq("church_id", churchId).in("person_id", personIds).returns<{ person_id: string }[]>(),
    supabase
      .from("church_threads")
      .select("id, person_id")
      .eq("church_id", churchId)
      .in("person_id", personIds)
      .not("escalated_at", "is", null)
      .returns<{ id: string; person_id: string }[]>(),
  ]);

  const source = new Map<string, EscalationSource>();
  for (const a of audit.data ?? []) {
    if (source.has(a.thread_id)) continue;
    const s = a.details?.source;
    source.set(a.thread_id, a.actor_type === "staff" ? "staff" : s === "tier2" ? "tier2" : s === "model" ? "model" : "rules");
  }
  const count = <T,>(list: T[] | null, key: (t: T) => string) => {
    const m = new Map<string, number>();
    for (const t of list ?? []) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
    return m;
  };
  const guestMessages = count(inbound.data, (m) => m.thread_id);
  const householdSize = count(household.data, (h) => h.person_id);
  const interests = new Map((people.data ?? []).map((p) => [p.id, p.interests ?? []]));

  for (const r of escalated) {
    out.set(
      r.thread_id,
      escalationBrief({
        reason: r.escalation_reason ?? "other",
        source: r.escalated_by ? "staff" : (source.get(r.thread_id) ?? "rules"),
        flaggedBy: r.escalated_by ? (names.get(r.escalated_by) ?? null) : null,
        firstName: r.first_name,
        visitCount: r.visit_count,
        serviceName: r.service_name,
        interests: interests.get(r.person_id),
        householdSize: householdSize.get(r.person_id) ?? 0,
        guestMessages: guestMessages.get(r.thread_id) ?? 0,
        earlierEscalations: (earlier.data ?? []).filter((t) => t.person_id === r.person_id && t.id !== r.thread_id).length,
        comingBackOn: r.coming_back_on ? formatDateOnly(r.coming_back_on) : null,
        hasPhone: Boolean(r.phone),
        channel: r.channel,
      }),
    );
  }
  return out;
}

/** The action count for the sidebar badge: escalations, identity reviews, drafts and alerts. */
export async function countActions(supabase: SupabaseClient, churchId: string): Promise<number> {
  const [threads, alerts] = await Promise.all([
    supabase
      .from("church_inbox")
      .select("thread_id", { count: "exact", head: true })
      .eq("church_id", churchId)
      .in("attention", ["escalation", "review", "draft_ready"]),
    supabase.from("church_alerts").select("id", { count: "exact", head: true }).eq("church_id", churchId).is("resolved_at", null),
  ]);
  return (threads.count ?? 0) + (alerts.count ?? 0);
}

/** Pilot targets (pilot plan / SOW): measured from this church's own threads. */
async function pilotHealth(supabase: SupabaseClient, churchId: string): Promise<HealthRow[]> {
  const [firsts, threads, optedOut] = await Promise.all([
    supabase
      .from("church_first_contact_stats")
      .select("on_time")
      .eq("church_id", churchId)
      .not("first_contact_sent_at", "is", null)
      .limit(5000)
      .returns<{ on_time: boolean }[]>(),
    supabase
      .from("church_inbox")
      .select("first_contact_sent_at, last_inbound_at, escalated_at, escalation_answered_at")
      .eq("church_id", churchId)
      .limit(5000)
      .returns<{ first_contact_sent_at: string | null; last_inbound_at: string | null; escalated_at: string | null; escalation_answered_at: string | null }[]>(),
    supabase
      .from("church_threads")
      .select("id, closed_at")
      .eq("church_id", churchId)
      .eq("status", "opted_out")
      .limit(5000)
      .returns<{ id: string; closed_at: string }[]>(),
  ]);

  const onTime = firsts.data ?? [];
  const firstPct = onTime.length ? onTime.filter((r) => r.on_time).length / onTime.length : null;

  const contacted = (threads.data ?? []).filter((t) => t.first_contact_sent_at);
  const replyPct = contacted.length ? contacted.filter((t) => t.last_inbound_at).length / contacted.length : null;

  const humanMin = median(
    (threads.data ?? [])
      .filter((t) => t.escalated_at && t.escalation_answered_at)
      .map((t) => (new Date(t.escalation_answered_at!).getTime() - new Date(t.escalated_at!).getTime()) / 60_000),
  );

  // STOP honored: nothing went out on an opted-out thread after the STOP.
  let stopPct: number | null = null;
  const stopped = optedOut.data ?? [];
  if (stopped.length) {
    const { data } = await supabase
      .from("church_messages")
      .select("thread_id, sent_at")
      .eq("church_id", churchId)
      .in("thread_id", stopped.map((t) => t.id))
      .not("sent_at", "is", null)
      .returns<{ thread_id: string; sent_at: string }[]>();
    const closedAt = new Map(stopped.map((t) => [t.id, t.closed_at]));
    const broken = new Set((data ?? []).filter((m) => m.sent_at > (closedAt.get(m.thread_id) ?? "")).map((m) => m.thread_id));
    stopPct = (stopped.length - broken.size) / stopped.length;
  }

  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
  return [
    { label: "First text ≤ 30 min after service end", target: "≥ 95%", current: pct(firstPct), onTrack: firstPct === null ? null : firstPct >= 0.95 },
    { label: "Guest reply rate", target: "≥ 30%", current: pct(replyPct), onTrack: replyPct === null ? null : replyPct >= 0.3 },
    {
      label: "Median time to human on escalations",
      target: "≤ 15 min",
      current: humanMin === null ? "—" : `${Math.round(humanMin)} min`,
      onTrack: humanMin === null ? null : humanMin <= 15,
    },
    { label: "STOP honored", target: "100%", current: pct(stopPct), onTrack: stopPct === null ? null : stopPct === 1 },
  ];
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

/** "Sun, Nov 1" for a YYYY-MM-DD date. */
function formatDateOnly(d: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));
}

/** A wall-clock "HH:MM[:SS]" as a Date whose UTC time is that clock. */
function timeOn(t: string) {
  return new Date(`2000-01-01T${t.slice(0, 5)}:00Z`);
}
