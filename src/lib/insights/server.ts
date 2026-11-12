import "server-only";

import { getChurchSession } from "@/lib/church/server";
import { computeInsights, type Approval, type Insights, type ThreadFacts } from "./compute";

// Loads a church's rows for Insights. Ids, timestamps and flags only: no guest names or words.
// RLS limits every row to the caller's church; the church id is also applied as a filter.

export const INSIGHTS_WEEKS = [4, 8, 12] as const;
export type InsightsWeeks = (typeof INSIGHTS_WEEKS)[number];

export interface InsightsData extends Insights {
  churchName: string;
  timezone: string;
  range: InsightsWeeks;
  now: string;
}

export type InsightsResult = { kind: "ok"; insights: InsightsData } | { kind: "no-church" };

const MAX_ROWS = 5000;

export async function getInsights(range: InsightsWeeks): Promise<InsightsResult> {
  const session = await getChurchSession();
  if (!session) return { kind: "no-church" };
  const { supabase, churchId } = session;
  const now = new Date();
  // A week of slack before the range so a visit's escalation late in the range still counts.
  const since = new Date(now.getTime() - (range + 1) * 7 * 86_400_000).toISOString();

  const [church, stats, inbox, stopped, approved] = await Promise.all([
    supabase.from("churches").select("name, timezone").eq("id", churchId).maybeSingle<{ name: string; timezone: string | null }>(),
    supabase
      .from("church_first_contact_stats")
      .select("thread_id, latency_s, on_time")
      .eq("church_id", churchId)
      .not("first_contact_sent_at", "is", null)
      .limit(MAX_ROWS)
      .returns<{ thread_id: string; latency_s: number | null; on_time: boolean | null }[]>(),
    supabase
      .from("church_inbox")
      .select("thread_id, channel, status, created_at, first_contact_sent_at, last_inbound_at, escalated_at, escalation_answered_at")
      .eq("church_id", churchId)
      .gte("created_at", since)
      .limit(MAX_ROWS)
      .returns<
        {
          thread_id: string;
          channel: "sms" | "email";
          status: "open" | "closed" | "opted_out";
          created_at: string;
          first_contact_sent_at: string | null;
          last_inbound_at: string | null;
          escalated_at: string | null;
          escalation_answered_at: string | null;
        }[]
      >(),
    supabase
      .from("church_threads")
      .select("id, closed_at")
      .eq("church_id", churchId)
      .eq("status", "opted_out")
      .gte("created_at", since)
      .limit(MAX_ROWS)
      .returns<{ id: string; closed_at: string | null }[]>(),
    supabase
      .from("church_audit_log")
      .select("created_at, details")
      .eq("church_id", churchId)
      .eq("action", "message.approved")
      .gte("created_at", since)
      .limit(MAX_ROWS)
      .returns<{ created_at: string; details: { approval_delay_s?: number } | null }[]>(),
  ]);
  for (const r of [church, stats, inbox, stopped, approved]) {
    if (r.error) throw new Error(`Couldn't load insights: ${r.error.message}`);
  }
  if (!church.data) return { kind: "no-church" };
  const tz = church.data.timezone || "America/Chicago";

  // STOP honored: nothing went out on an opted-out thread after the STOP.
  const stopRows = stopped.data ?? [];
  const closedAt = new Map(stopRows.map((t) => [t.id, t.closed_at]));
  const sentAfterStop = new Set<string>();
  if (stopRows.length) {
    const { data, error } = await supabase
      .from("church_messages")
      .select("thread_id, sent_at")
      .eq("church_id", churchId)
      .in("thread_id", stopRows.map((t) => t.id))
      .not("sent_at", "is", null)
      .limit(MAX_ROWS)
      .returns<{ thread_id: string; sent_at: string }[]>();
    if (error) throw new Error(`Couldn't load insights: ${error.message}`);
    for (const m of data ?? []) {
      const c = closedAt.get(m.thread_id);
      if (c && m.sent_at > c) sentAfterStop.add(m.thread_id);
    }
  }

  const statsById = new Map((stats.data ?? []).map((s) => [s.thread_id, s]));
  const threads: ThreadFacts[] = (inbox.data ?? []).map((r) => {
    const s = statsById.get(r.thread_id);
    return {
      threadId: r.thread_id,
      channel: r.channel,
      status: r.status,
      createdAt: r.created_at,
      firstContactSentAt: r.first_contact_sent_at,
      latencyS: s?.latency_s ?? null,
      onTime: s?.on_time ?? null,
      lastInboundAt: r.last_inbound_at,
      escalatedAt: r.escalated_at,
      escalationAnsweredAt: r.escalation_answered_at,
      closedAt: closedAt.get(r.thread_id) ?? null,
      sentAfterStop: sentAfterStop.has(r.thread_id),
    };
  });
  const approvals: Approval[] = (approved.data ?? []).map((a) => ({
    at: a.created_at,
    delayS: typeof a.details?.approval_delay_s === "number" ? a.details.approval_delay_s : null,
  }));

  return {
    kind: "ok",
    insights: {
      ...computeInsights(threads, approvals, { tz, now, weeks: range }),
      churchName: church.data.name,
      timezone: tz,
      range,
      now: now.toISOString(),
    },
  };
}
