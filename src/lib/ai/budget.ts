import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// Per-church daily AI budget (DB-10). Tokens used today (church time) come from the model-call
// audit rows. Above the budget the assistant stops calling models for that church until tomorrow
// (rules-based escalation keeps working), and staff and the on-call get an alert once.

export const DEFAULT_DAILY_TOKEN_BUDGET = 300_000;

export function dailyTokenBudget(): number {
  const n = Number(process.env.AI_DAILY_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_TOKEN_BUDGET;
}

/** The kill switch: AI_AGENT_OFF=1 stops all model calls on guest messages (rules still escalate). */
export function agentOff(): boolean {
  return process.env.AI_AGENT_OFF === "1" || process.env.AI_AGENT_OFF === "true";
}

/** True when the church has used its budget today. Raises the alert the first time. */
export async function overBudget(admin: SupabaseClient, churchId: string, cache: Map<string, boolean>): Promise<boolean> {
  const known = cache.get(churchId);
  if (known !== undefined) return known;
  const { data, error } = await admin.rpc("church_ai_tokens_today", { p_church: churchId });
  if (error) throw new Error(`church_ai_tokens_today: ${error.message}`);
  const over = Number(data ?? 0) >= dailyTokenBudget();
  if (over) {
    await admin.rpc("raise_church_alert", {
      p_church: churchId,
      p_thread: null,
      p_message: null,
      p_kind: "ai_budget_reached",
      p_details: { budget: dailyTokenBudget() },
    });
  }
  cache.set(churchId, over);
  return over;
}

/**
 * Whether the assistant's passing drafts may go out on their own in Live mode. Off by default:
 * the go-live scope keeps the reply agent in Shadow (every draft waits for staff) even when the
 * church is Live for first contacts. Turn on with AI_AGENT_AUTOSEND=1 only after the eval and the
 * pastor sign off.
 */
export function agentAutosend(): boolean {
  return process.env.AI_AGENT_AUTOSEND === "1" || process.env.AI_AGENT_AUTOSEND === "true";
}
