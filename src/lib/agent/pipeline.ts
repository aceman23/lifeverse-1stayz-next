import { classify } from "@/lib/ai/classify";
import type { CompletionResult, ModelClient } from "@/lib/ai/types";
import type { EscalationReason } from "@/lib/domain/escalation";
import { pendingGuestText, replyChannelOf, type AgentContext } from "./context";
import { ESCALATION_FALLBACK, ESCALATION_LABELS, escalationFromRules, escalationTask, reasonOf } from "./escalation";
import { buildReplyMessages, buildReplySystem, checkReply, cleanReply } from "./reply";
import { TIER2_FALLBACK, TIER2_LABELS, tier2Decision, tier2Input, tier2Task } from "./tier2";

// One decision for one guest message (or burst of messages):
//   rules -> escalate          crisis, care, a pastor, complaint, minor (no model needed)
//   no model allowed -> skip   (AI-02) staff see it on Today as "Replied"
//   Tier-1 -> escalate         unless the model is sure the assistant can answer
//   draft a reply, check it
//   Tier-2 -> escalate | block (hold for staff) | pass
// The same function runs in production (src/lib/messaging/agent.ts) and in the eval set.

/** At most this many assistant replies per thread per day; then staff take it from there. */
export const DAILY_REPLY_CAP = 6;

export type AgentDecision =
  | { type: "escalate"; reason: EscalationReason; source: "rules" | "model" | "tier2"; detail: Record<string, unknown> }
  | { type: "reply"; body: string; channel: "sms" | "email"; hold: boolean; detail: Record<string, unknown> }
  | { type: "skip"; reason: string };

export interface ModelCall {
  purpose: "escalation" | "reply" | "tier2";
  completion: CompletionResult;
  tier2: "pass" | "escalate" | "block" | null;
  ok: boolean;
}

export interface DecideOptions {
  fast: ModelClient;
  frontier: ModelClient;
  now: Date;
  /** Guest data may go to the models (AI-02 confirmed, or the stub). */
  modelAllowed: boolean;
  /** Why not, when modelAllowed is false ('no_model', 'ai_budget', 'agent_off'). */
  noModelReason?: string;
  /** Eval runs: the conversation is made up, so it isn't guest data. */
  synthetic?: boolean;
}

export async function decide(ctx: AgentContext, opts: DecideOptions): Promise<{ decision: AgentDecision; calls: ModelCall[] }> {
  const calls: ModelCall[] = [];
  const guestText = pendingGuestText(ctx);
  const guestData = !opts.synthetic;
  if (!guestText.trim()) return { decision: { type: "skip", reason: "nothing_to_answer" }, calls };

  // DB-08: every model call names its church and guardrail version.
  const cacheScope = { churchId: ctx.church_id, guardrailVersion: ctx.guardrails.version };

  // 1. Rules
  const ruled = escalationFromRules(guestText);
  if (ruled) {
    return { decision: { type: "escalate", reason: ruled.reason, source: "rules", detail: { rules: ruled.rules } }, calls };
  }

  if (!opts.modelAllowed) return { decision: { type: "skip", reason: opts.noModelReason ?? "no_model" }, calls };
  if (ctx.guardrails.version == null || !ctx.guardrails.config) return { decision: { type: "skip", reason: "guardrails_not_approved" }, calls };
  if (ctx.assistant_replies_24h >= DAILY_REPLY_CAP) return { decision: { type: "skip", reason: "daily_cap" }, calls };

  // 2. Tier-1
  const tier1 = await classify(opts.fast, {
    task: escalationTask(ctx),
    labels: ESCALATION_LABELS,
    input: guestText,
    fallback: ESCALATION_FALLBACK,
    guestData,
    cacheScope,
  });
  if (tier1.completion) calls.push({ purpose: "escalation", completion: tier1.completion, tier2: null, ok: !tier1.fallback });
  const t1Reason = reasonOf(tier1.labels[0]!);
  if (t1Reason) {
    return {
      decision: {
        type: "escalate",
        reason: t1Reason,
        source: "model",
        detail: { labels: tier1.labels, confidence: tier1.confidence, fallback: tier1.fallback ? tier1.reason : undefined },
      },
      calls,
    };
  }

  // 3. Draft
  const channel = replyChannelOf(ctx);
  const system = buildReplySystem(ctx, opts.now);
  let body: string;
  try {
    const completion = await opts.fast.complete({
      role: "fast",
      system,
      messages: buildReplyMessages(ctx),
      maxTokens: channel === "sms" ? 200 : 600,
      temperature: 0.4,
      guestData,
      cacheScope,
    });
    calls.push({ purpose: "reply", completion, tier2: null, ok: true });
    body = cleanReply(completion.text);
  } catch {
    return { decision: { type: "skip", reason: "reply_failed" }, calls };
  }
  const problems = checkReply(body, ctx, channel);
  if (problems.includes("empty")) return { decision: { type: "skip", reason: "empty_reply" }, calls };

  // 4. Tier-2
  const tier2 = await classify(opts.frontier, {
    task: tier2Task(ctx, system),
    labels: TIER2_LABELS,
    input: tier2Input(guestText, body),
    fallback: TIER2_FALLBACK,
    role: "frontier",
    guestData,
    cacheScope,
    timeoutMs: 30_000,
  });
  const verdict = tier2Decision(tier2.labels[0]!);
  if (tier2.completion) calls.push({ purpose: "tier2", completion: tier2.completion, tier2: verdict.decision, ok: !tier2.fallback });

  if (verdict.decision === "escalate") {
    return {
      decision: { type: "escalate", reason: verdict.reason!, source: "tier2", detail: { labels: tier2.labels, confidence: tier2.confidence } },
      calls,
    };
  }
  return {
    decision: {
      type: "reply",
      body: channel === "sms" ? body.slice(0, 1600) : body.slice(0, 10000),
      channel,
      hold: verdict.decision === "block" || problems.length > 0,
      detail: { tier2: verdict.decision, tier2_fallback: tier2.fallback ? tier2.reason : undefined, problems },
    },
    calls,
  };
}
