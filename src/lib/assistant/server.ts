import "server-only";

import { canSendGuestData } from "@/lib/ai";
import { agentAutosend, agentOff, dailyTokenBudget } from "@/lib/ai/budget";
import { getChurchSession } from "@/lib/church/server";
import type { ChurchMode } from "@/lib/church/types";

// AI Training for a real church: what the assistant follows (the pastor-approved guardrails and
// their numbered versions), whether it's on, and what it did in the last 7 days. Labels, counts
// and versions only; never a guest's words. RLS limits every row to the caller's church.

export type Stance = "explain" | "route" | "skip";

export interface GuardrailConfig {
  tone: string[];
  signOff: string | null;
  positions: { topic: string; stance: Stance; wording: string }[];
  escalationTopics: string[];
  documents: string[];
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface GuardrailVersion {
  version: number;
  approvedBy: string | null;
  approvedAt: string;
  /** When the assistant first used it. */
  firstUsedAt: string;
}

export type DraftingState = "on" | "off_terms" | "off_switch" | "off_budget";

export interface AssistantData {
  mode: ChurchMode;
  drafting: DraftingState;
  autosend: boolean;
  tokensToday: number;
  tokenBudget: number;
  /** The approved guardrails as they are now; null until the pastor approves. */
  current: GuardrailConfig | null;
  /** The version the assistant uses now, or null if the current approval isn't numbered yet. */
  currentVersion: number | null;
  versions: GuardrailVersion[];
  week: {
    read: number;
    sensitive: number;
    escalated: { rules: number; model: number; tier2: number; staff: number };
    drafted: number;
    heldForCheck: number;
    approved: number;
    discarded: number;
    skipped: { reason: string; count: number }[];
  };
}

export type AssistantResult = { kind: "ok"; assistant: AssistantData } | { kind: "no-church" };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Start of today in the church's time zone, as an instant. */
function startOfToday(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const since = ((get("hour") % 24) * 3600 + get("minute") * 60 + get("second")) * 1000;
  return new Date(now.getTime() - since - now.getMilliseconds());
}

const WEEK_ACTIONS = ["message.classified", "thread.escalated", "agent.reply_drafted", "agent.skipped", "message.approved", "message.discarded"];

export async function getAssistant(): Promise<AssistantResult> {
  const session = await getChurchSession();
  if (!session) return { kind: "no-church" };
  const { supabase, churchId } = session;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const { data: church, error } = await supabase
    .from("churches")
    .select(
      `timezone, onboarding_progress (mode),
       church_guardrails (tone, sign_off, approved_by, approved_at),
       church_doctrinal_positions (topic, stance, wording, position),
       church_escalation_topics (label, enabled, position),
       church_documents (name, position)`,
    )
    .eq("id", churchId)
    .maybeSingle<{
      timezone: string | null;
      onboarding_progress: { mode: ChurchMode | null } | { mode: ChurchMode | null }[] | null;
      church_guardrails:
        | { tone: string[]; sign_off: string | null; approved_by: string | null; approved_at: string | null }
        | { tone: string[]; sign_off: string | null; approved_by: string | null; approved_at: string | null }[]
        | null;
      church_doctrinal_positions: { topic: string; stance: Stance; wording: string; position: number }[];
      church_escalation_topics: { label: string; enabled: boolean; position: number }[];
      church_documents: { name: string; position: number }[];
    }>();
  if (error) throw new Error(`Couldn't load AI Training: ${error.message}`);
  if (!church) return { kind: "no-church" };
  const tz = church.timezone || "America/Chicago";
  const dayStart = startOfToday(tz, now).toISOString();

  const [versions, week, tokens] = await Promise.all([
    supabase
      .from("church_guardrail_versions")
      .select("version, approved_by, approved_at, created_at")
      .eq("church_id", churchId)
      .order("version", { ascending: false })
      .limit(50)
      .returns<{ version: number; approved_by: string | null; approved_at: string; created_at: string }[]>(),
    supabase
      .from("church_audit_log")
      .select("action, actor_type, reason, details")
      .eq("church_id", churchId)
      .in("action", WEEK_ACTIONS)
      .gte("created_at", weekAgo)
      .limit(10_000)
      .returns<{ action: string; actor_type: string; reason: string | null; details: Record<string, unknown> | null }[]>(),
    supabase
      .from("church_audit_log")
      .select("tokens_in, tokens_out")
      .eq("church_id", churchId)
      .eq("action", "model.call")
      .gte("created_at", dayStart)
      .limit(10_000)
      .returns<{ tokens_in: number | null; tokens_out: number | null }[]>(),
  ]);
  for (const r of [versions, week, tokens]) if (r.error) throw new Error(`Couldn't load AI Training: ${r.error.message}`);

  const g = one(church.church_guardrails);
  const current: GuardrailConfig | null = g?.approved_at
    ? {
        tone: g.tone ?? [],
        signOff: g.sign_off,
        positions: [...(church.church_doctrinal_positions ?? [])]
          .sort((a, b) => a.position - b.position || a.topic.localeCompare(b.topic))
          .map(({ topic, stance, wording }) => ({ topic, stance, wording })),
        escalationTopics: [...(church.church_escalation_topics ?? [])]
          .filter((e) => e.enabled)
          .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
          .map((e) => e.label),
        documents: [...(church.church_documents ?? [])].sort((a, b) => a.position - b.position).map((d) => d.name),
        approvedBy: g.approved_by,
        approvedAt: g.approved_at,
      }
    : null;

  const vs = versions.data ?? [];
  // The newest version matches the current approval when it carries the same approval time.
  const latest = vs[0];
  const currentVersion =
    current && latest && new Date(latest.approved_at).getTime() === new Date(current.approvedAt!).getTime() ? latest.version : null;

  const tokensToday = (tokens.data ?? []).reduce((n, r) => n + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0);
  const budget = dailyTokenBudget();
  const drafting: DraftingState = !canSendGuestData() ? "off_terms" : agentOff() ? "off_switch" : tokensToday >= budget ? "off_budget" : "on";

  const rows = week.data ?? [];
  const skipped = new Map<string, number>();
  const escalated = { rules: 0, model: 0, tier2: 0, staff: 0 };
  let read = 0;
  let sensitive = 0;
  let drafted = 0;
  let heldForCheck = 0;
  let approved = 0;
  let discarded = 0;
  for (const r of rows) {
    switch (r.action) {
      case "message.classified":
        read++;
        if (r.reason === "C3") sensitive++;
        break;
      case "thread.escalated": {
        const source = typeof r.details?.source === "string" ? r.details.source : null;
        if (r.actor_type === "staff") escalated.staff++;
        else if (source === "tier2") escalated.tier2++;
        else if (source === "model" || r.actor_type === "model") escalated.model++;
        else escalated.rules++;
        break;
      }
      case "agent.reply_drafted":
        drafted++;
        if (r.details?.held_for_check === true) heldForCheck++;
        break;
      case "agent.skipped":
        if (r.reason) skipped.set(r.reason, (skipped.get(r.reason) ?? 0) + 1);
        break;
      case "message.approved":
        approved++;
        break;
      case "message.discarded":
        discarded++;
        break;
    }
  }

  return {
    kind: "ok",
    assistant: {
      mode: one(church.onboarding_progress)?.mode ?? "shadow",
      drafting,
      autosend: agentAutosend(),
      tokensToday,
      tokenBudget: budget,
      current,
      currentVersion,
      versions: vs.map((v) => ({ version: v.version, approvedBy: v.approved_by, approvedAt: v.approved_at, firstUsedAt: v.created_at })),
      week: {
        read,
        sensitive,
        escalated,
        drafted,
        heldForCheck,
        approved,
        discarded,
        skipped: [...skipped].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      },
    },
  };
}
