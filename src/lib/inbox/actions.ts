"use server";

import { nudgeJob } from "@/lib/jobs/nudge";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/church/types";
import { getChurchSession, isDemoRequest } from "@/lib/church/server";
import { ESCALATION_REASONS, isUuid, MAX_EMAIL, MAX_SMS, type InboxChannel } from "./types";
import { logError } from "@/lib/log";

// Staff actions from Conversations, Today and the person page. Each calls one database
// function as the signed-in staff member; the function checks the church, locks the thread,
// enforces the send rules and writes the audit row. Messages that are ready go out right away
// (the cron sender is the backstop). Logs carry ids and codes only.
//
// The demo workspace saves nothing: actions succeed and the page keeps the change in memory.

const SIGNED_OUT_ERROR = "Your session has ended. Sign in again.";
const GENERIC_ERROR = "Something went wrong. Try again.";

/** Postgres codes our functions raise with a message written for staff. */
const STAFF_FACING = new Set(["22023", "23514", "55000", "P0002", "28000"]);

type Rpc = { error: { code?: string; message: string } | null };

async function call(event: string, fn: string, args: Record<string, unknown>, opts: { send?: boolean; notify?: boolean } = {}): Promise<ActionResult> {
  if (await isDemoRequest()) return { ok: true, data: undefined };
  const session = await getChurchSession().catch(() => null);
  if (!session) return { ok: false, error: SIGNED_OUT_ERROR };

  const { error } = (await session.supabase.rpc(fn, args)) as Rpc;
  if (error) {
    if (error.code && STAFF_FACING.has(error.code)) return { ok: false, error: error.message };
    logError(`${event}_error`, { code: error.code ?? null });
    return { ok: false, error: GENERIC_ERROR };
  }

  if (opts.notify) {
    after(async () => {
      try {
        await nudgeJob("notifications");
      } catch (e) {
        logError("inbox.notify_now_error", { message: e instanceof Error ? e.name : "unknown" });
      }
    });
  }
  if (opts.send) {
    after(async () => {
      try {
        await nudgeJob("messages");
      } catch (e) {
        logError("inbox.send_now_error", { message: e instanceof Error ? e.name : "unknown" });
      }
    });
  }
  // Today, the inbox, the person page and the sidebar badge all read these rows.
  revalidatePath("/", "layout");
  return { ok: true, data: undefined };
}

const notFound = (what: string): ActionResult => ({ ok: false, error: `This ${what} was not found.` });

/** A staff reply in the thread. requestId (a UUID from the browser) stops a double submit sending twice. */
export async function sendReply(threadId: string, body: string, channel: InboxChannel | null, requestId: string): Promise<ActionResult> {
  if (!isUuid(threadId) && !(await isDemoRequest())) return notFound("conversation");
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Write a message first." };
  if (channel !== null && channel !== "sms" && channel !== "email") return { ok: false, error: "Choose text or email." };
  if (text.length > (channel === "sms" ? MAX_SMS : MAX_EMAIL)) {
    return { ok: false, error: channel === "sms" ? "Keep texts to 1,600 characters or fewer." : "That message is too long." };
  }
  return call(
    "inbox.reply",
    "staff_send_reply",
    { p_thread: threadId, p_body: text, p_channel: channel, p_request_id: isUuid(requestId) ? requestId : null },
    { send: true },
  );
}

/** Shadow mode: send a held message, optionally edited. */
export async function approveMessage(messageId: string, body: string | null): Promise<ActionResult> {
  if (!isUuid(messageId) && !(await isDemoRequest())) return notFound("draft");
  const text = typeof body === "string" ? body.trim() : null;
  if (text !== null && text.length > MAX_EMAIL) return { ok: false, error: "That message is too long." };
  return call("inbox.approve", "staff_approve_message", { p_message: messageId, p_body: text || null }, { send: true });
}

export async function discardMessage(messageId: string): Promise<ActionResult> {
  if (!isUuid(messageId) && !(await isDemoRequest())) return notFound("draft");
  return call("inbox.discard", "staff_discard_message", { p_message: messageId });
}

export async function takeOver(threadId: string): Promise<ActionResult> {
  if (!isUuid(threadId) && !(await isDemoRequest())) return notFound("conversation");
  return call("inbox.take_over", "staff_take_over", { p_thread: threadId });
}

export async function releaseThread(threadId: string): Promise<ActionResult> {
  if (!isUuid(threadId) && !(await isDemoRequest())) return notFound("conversation");
  return call("inbox.release", "staff_release_thread", { p_thread: threadId });
}

export async function escalateThread(threadId: string, reason: string): Promise<ActionResult> {
  if (!isUuid(threadId) && !(await isDemoRequest())) return notFound("conversation");
  if (!(ESCALATION_REASONS as readonly string[]).includes(reason)) return { ok: false, error: "Choose why this needs a pastor." };
  return call("inbox.escalate", "staff_escalate", { p_thread: threadId, p_reason: reason }, { notify: true });
}

export async function assignThread(threadId: string, userId: string | null): Promise<ActionResult> {
  if (!isUuid(threadId) && !(await isDemoRequest())) return notFound("conversation");
  if (userId !== null && !isUuid(userId) && !(await isDemoRequest())) return { ok: false, error: "Choose someone on your team." };
  return call("inbox.assign", "staff_assign_thread", { p_thread: threadId, p_user: userId });
}

export type FollowUpAction = "done" | "not_priority" | "snooze" | "undo" | "coming_back" | "welcomed";

const SNOOZE_DAYS = { "1d": 1, "3d": 3, "7d": 7 } as const;
export type SnoozeFor = keyof typeof SNOOZE_DAYS;

/** Today list: done, not a priority (with a reason), snooze, undo, coming back on a date, welcomed. */
export async function followUp(
  threadId: string,
  action: FollowUpAction,
  opts: { reason?: string; snooze?: SnoozeFor; on?: string } = {},
): Promise<ActionResult> {
  if (!isUuid(threadId) && !(await isDemoRequest())) return notFound("conversation");
  if (!["done", "not_priority", "snooze", "undo", "coming_back", "welcomed"].includes(action)) return { ok: false, error: GENERIC_ERROR };
  const until = action === "snooze" && opts.snooze && SNOOZE_DAYS[opts.snooze] ? new Date(Date.now() + SNOOZE_DAYS[opts.snooze] * 86_400_000) : null;
  if (action === "snooze" && !until) return { ok: false, error: "Choose how long to snooze." };
  if (action === "coming_back" && !/^\d{4}-\d{2}-\d{2}$/.test(opts.on ?? "")) return { ok: false, error: "Choose the date they're coming back." };
  return call("inbox.followup", "staff_followup", {
    p_thread: threadId,
    p_action: action,
    p_reason: opts.reason?.slice(0, 60) ?? null,
    p_until: until?.toISOString() ?? null,
    p_on: action === "coming_back" ? opts.on : null,
  });
}

export async function resolveAlert(alertId: string): Promise<ActionResult> {
  if (!isUuid(alertId) && !(await isDemoRequest())) return notFound("alert");
  return call("inbox.resolve_alert", "staff_resolve_alert", { p_alert: alertId });
}
