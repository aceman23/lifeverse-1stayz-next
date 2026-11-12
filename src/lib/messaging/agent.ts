import "server-only";

import { canSendGuestData, createModelClient, type ModelClient } from "@/lib/ai";
import { agentAutosend, agentOff, overBudget } from "@/lib/ai/budget";
import { assertTenant, pendingGuestText, TenantMismatchError, type AgentContext } from "@/lib/agent/context";
import { decide } from "@/lib/agent/pipeline";
import { extractState } from "@/lib/agent/state";
import { logPrompt } from "@/lib/ai/prompt-log";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import { recordSecurityEvent } from "@/lib/security/events";

// The agent loop (WP-7b). Runs every minute from /api/cron/messages and right after a guest
// message comes in. For each thread with a guest message the assistant hasn't handled:
//   context (ISO-2 check) -> decide (rules, Tier-1, draft, Tier-2) -> escalate | draft | skip
// Drafts are held for staff in Shadow mode, when any check fails, and in Live mode too unless
// AI_AGENT_AUTOSEND=1 (go-live scope: the agent stays in Shadow while first contacts go Live).
// Every model call is audited with the guardrail version. Logs carry ids, codes and counts only.

export interface AgentSummary {
  claimed: number;
  escalated: number;
  drafted: number;
  skipped: number;
  errors: number;
  /** Threads where the state writer recorded something (AI-09). */
  stateUpdates?: number;
  skippedRun?: string;
}


export async function runAgent({
  limit = 10,
  signal,
  fast,
  frontier,
  now = () => new Date(),
}: { limit?: number; signal?: AbortSignal; fast?: ModelClient; frontier?: ModelClient; now?: () => Date } = {}): Promise<AgentSummary> {
  const summary: AgentSummary = { claimed: 0, escalated: 0, drafted: 0, skipped: 0, errors: 0 };
  signal?.throwIfAborted();
  const admin = createAdminClient({ signal });
  if (!admin) return { ...summary, skippedRun: "no_service_role" };

  const { data, error } = await admin.rpc("agent_claim_threads", { p_limit: limit });
  if (error) throw new Error(`agent_claim_threads: ${error.message}`);
  const claimed = (data ?? []) as { thread_id: string; church_id: string; mode: string; guest_seq: number }[];
  summary.claimed = claimed.length;
  if (claimed.length === 0) return summary;

  const fastClient = fast ?? createModelClient("messaging", { signal });
  const frontierClient = frontier ?? createModelClient("messaging", { signal });
  const off = agentOff();
  const modelAllowed = canSendGuestData() && !off;
  const budgets = new Map<string, boolean>();

  for (const job of claimed) {
    signal?.throwIfAborted();
    try {
      const { data: ctxData, error: ctxError } = await admin.rpc("agent_context", { p_thread: job.thread_id });
      if (ctxError || !ctxData) throw new Error(`agent_context: ${ctxError?.message ?? "missing"}`);
      const ctx = ctxData as AgentContext;
      assertTenant(ctx, job.church_id);
      const names = [ctx.person.first_name, ...ctx.person.household.map((h) => h.name)];

      // Over today's AI budget: no model calls for this church (the rules still escalate).
      const budgetLeft = modelAllowed ? !(await overBudget(admin, job.church_id, budgets)) : true;
      const { decision, calls } = await decide(ctx, {
        fast: fastClient,
        frontier: frontierClient,
        now: now(),
        modelAllowed: modelAllowed && budgetLeft,
        noModelReason: off ? "agent_off" : !budgetLeft ? "ai_budget" : "no_model",
      });

      for (const call of calls) {
        const c = call.completion;
        await admin.rpc("log_model_call", {
          p_church: job.church_id,
          p_thread: job.thread_id,
          p_message: null,
          p_purpose: call.purpose,
          p_model: c.model,
          p_guardrail_version: ctx.guardrails.version,
          p_tier2: call.tier2,
          p_tokens_in: c.usage.inputTokens,
          p_tokens_out: c.usage.outputTokens,
          p_latency_ms: c.latencyMs,
          p_details: { provider: c.provider, role: c.role, ok: call.ok },
        });
        await logPrompt(admin, { churchId: job.church_id, threadId: job.thread_id, purpose: call.purpose, guardrailVersion: ctx.guardrails.version, completion: c, names });
      }

      // AI-09: what the guest told us (coming back, household, interests). Rules always; the model
      // only for ordinary messages (not escalations) and when guest data may reach it.
      const guestText = pendingGuestText(ctx);
      const lastGuest = [...ctx.turns].reverse().find((t) => t.from === "guest");
      if (guestText && lastGuest) {
        const state = await extractState(ctx, { fast: fastClient, now: now(), modelAllowed: modelAllowed && budgetLeft && decision.type !== "escalate" }, guestText);
        if (state.completion) {
          const c = state.completion;
          await admin.rpc("log_model_call", {
            p_church: job.church_id,
            p_thread: job.thread_id,
            p_message: lastGuest.id,
            p_purpose: "state",
            p_model: c.model,
            p_guardrail_version: ctx.guardrails.version,
            p_tier2: null,
            p_tokens_in: c.usage.inputTokens,
            p_tokens_out: c.usage.outputTokens,
            p_latency_ms: c.latencyMs,
            p_details: { provider: c.provider, role: c.role, ok: true },
          });
          await logPrompt(admin, { churchId: job.church_id, threadId: job.thread_id, messageId: lastGuest.id, purpose: "state", guardrailVersion: ctx.guardrails.version, completion: c, names });
        }
        if (state.update.facts.length || state.update.comingBackOn) {
          const { error: e } = await admin.rpc("agent_record_state", {
            p_thread: job.thread_id,
            p_message: lastGuest.id,
            p_coming_back_on: state.update.comingBackOn,
            p_facts: state.update.facts,
          });
          if (e) log("agent.state_error", { thread_id: job.thread_id, message: e.message });
          else summary.stateUpdates = (summary.stateUpdates ?? 0) + 1;
        }
      }

      if (decision.type === "escalate") {
        const { error: e } = await admin.rpc("agent_escalate", {
          p_thread: job.thread_id,
          p_seen_seq: job.guest_seq,
          p_reason: decision.reason,
          p_source: decision.source,
          p_detail: decision.detail,
        });
        if (e) throw new Error(`agent_escalate: ${e.message}`);
        summary.escalated++;
        log("agent.escalated", { thread_id: job.thread_id, reason: decision.reason, source: decision.source });
      } else if (decision.type === "reply") {
        const { data: id, error: e } = await admin.rpc("agent_record_reply", {
          p_thread: job.thread_id,
          p_seen_seq: job.guest_seq,
          p_body: decision.body,
          p_channel: decision.channel,
          // Held unless it passed every check AND auto-send is on (go-live: off).
          p_hold: decision.hold || !agentAutosend(),
          p_guardrail_version: ctx.guardrails.version,
          p_detail: decision.detail,
        });
        if (e) throw new Error(`agent_record_reply: ${e.message}`);
        if (id) summary.drafted++;
        log("agent.drafted", { thread_id: job.thread_id, message_id: id ?? null, hold: decision.hold });
      } else {
        await admin.rpc("agent_skip", {
          p_thread: job.thread_id,
          p_seen_seq: job.guest_seq,
          p_reason: decision.reason,
          p_guardrail_version: ctx.guardrails.version,
        });
        summary.skipped++;
      }
    } catch (e) {
      signal?.throwIfAborted();
      summary.errors++;
      if (e instanceof TenantMismatchError) {
        // A security event: nothing about this thread goes to a model. Mark the message seen so
        // it isn't retried; staff still see it on Today.
        log("security.tenant_mismatch", { thread_id: job.thread_id, church_id: job.church_id, path: e.path });
        await recordSecurityEvent(admin, "tenant_mismatch", "agent.context", {
          churchId: job.church_id,
          threadId: job.thread_id,
          details: { path: e.path },
        });
        await admin.rpc("agent_skip", { p_thread: job.thread_id, p_seen_seq: job.guest_seq, p_reason: "tenant_mismatch" });
      } else {
        // The lease runs out and the next run tries again.
        log("agent.error", { thread_id: job.thread_id, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  log("agent.run", { ...summary, model: modelAllowed });
  return summary;
}
