import "server-only";

import {
  applyRules,
  canSendGuestData,
  classify,
  classFromRules,
  combineClass,
  createModelClient,
  DATA_CLASS_FALLBACK,
  DATA_CLASS_LABELS,
  DATA_CLASS_TASK,
  type ModelClient,
} from "@/lib/ai";
import { agentOff, overBudget } from "@/lib/ai/budget";
import { createAdminClient } from "@/lib/supabase/admin";
import { logPrompt } from "@/lib/ai/prompt-log";
import { log } from "@/lib/log";

// The data-class tagger (WP-7a, guidelines §3). Every message starts as C3, the strictest class.
// Each run takes untagged messages and:
//   1. rules: a sensitive topic (prayer, grief, crisis...) settles it as C3 with no model call;
//   2. otherwise the fast model is asked (sensitive / identifying / ordinary), and the stricter
//      of the rules and the model wins: C3, then C1 (names, numbers, addresses), else C2.
// Guest text goes to a model only when allowed (AI-02; the stub always is). If the model can't
// be used or gives no clear answer, the message stays C3 and is retried, at most 3 times.
// Every decision and every model call is audited with the church's guardrail version.
// Logs carry ids and counts only.

export interface TagSummary {
  tagged: number;
  byRules: number;
  byModel: number;
  /** Left as C3 this run (no model, or an unclear answer). */
  undecided: number;
  skipped?: string;
}

interface Untagged {
  message_id: string;
  church_id: string;
  thread_id: string;
  body: string;
  direction: string;
  sender: string;
  names: string[] | null;
}


export async function runTagger({ limit = 50, client, signal }: { limit?: number; client?: ModelClient; signal?: AbortSignal } = {}): Promise<TagSummary> {
  const summary: TagSummary = { tagged: 0, byRules: 0, byModel: 0, undecided: 0 };
  signal?.throwIfAborted();
  const admin = createAdminClient({ signal });
  if (!admin) return { ...summary, skipped: "no_service_role" };

  const { data, error } = await admin.rpc("claim_untagged_messages", { p_limit: limit });
  if (error) throw new Error(`claim_untagged_messages: ${error.message}`);
  const rows = (data ?? []) as Untagged[];
  if (rows.length === 0) return summary;

  const modelOk = canSendGuestData() && !agentOff();
  const budgets = new Map<string, boolean>();
  const ai = client ?? createModelClient("messaging", { signal });
  const versions = new Map<string, number | null>();

  for (const row of rows) {
    signal?.throwIfAborted();
    const rules = applyRules(row.body, row.names ?? []);
    const ruleClass = classFromRules(rules);

    if (ruleClass) {
      const { data: done, error: tagError } = await admin.rpc("tag_message_data_class", {
        p_message: row.message_id,
        p_class: ruleClass,
        p_source: "rules",
        p_detail: { rules: rules.sensitive, identifiers: rules.identifiers },
      });
      if (tagError) throw new Error(`tag_message_data_class: ${tagError.message}`);
      if (done) {
        summary.tagged++;
        summary.byRules++;
      }
      continue;
    }

    if (!modelOk || (await overBudget(admin, row.church_id, budgets))) {
      // No model allowed yet (AI-02): the message stays C3. Counting the attempt keeps a backlog
      // from blocking newer messages; after 3 runs it's no longer claimed.
      await admin.rpc("note_tag_attempt", { p_message: row.message_id });
      summary.undecided++;
      continue;
    }

    // The guardrail version goes on the model-call audit row (one lookup per church per run).
    if (!versions.has(row.church_id)) {
      const { data: v, error: vError } = await admin.rpc("current_guardrail_version", { p_church: row.church_id });
      if (vError) throw new Error(`current_guardrail_version: ${vError.message}`);
      versions.set(row.church_id, (v as { version: number | null }[] | null)?.[0]?.version ?? null);
    }

    const result = await classify(ai, {
      task: DATA_CLASS_TASK,
      labels: DATA_CLASS_LABELS,
      input: row.body,
      multi: true,
      fallback: DATA_CLASS_FALLBACK,
      guestData: true,
      cacheScope: { churchId: row.church_id, guardrailVersion: versions.get(row.church_id) ?? null },
    });

    if (result.completion) {
      const c = result.completion;
      const { error: logError } = await admin.rpc("log_model_call", {
        p_church: row.church_id,
        p_thread: row.thread_id,
        p_message: row.message_id,
        p_purpose: "data_class",
        p_model: c.model,
        p_guardrail_version: versions.get(row.church_id) ?? null,
        p_tier2: null,
        p_tokens_in: c.usage.inputTokens,
        p_tokens_out: c.usage.outputTokens,
        p_latency_ms: c.latencyMs,
        p_details: { provider: c.provider, role: c.role, ok: !result.fallback, fallback_reason: result.reason },
      });
      if (logError) throw new Error(`log_model_call: ${logError.message}`);
      await logPrompt(admin, {
        churchId: row.church_id,
        threadId: row.thread_id,
        messageId: row.message_id,
        purpose: "data_class",
        guardrailVersion: versions.get(row.church_id) ?? null,
        completion: c,
        names: row.names ?? [],
      });
    }

    if (result.fallback) {
      await admin.rpc("note_tag_attempt", { p_message: row.message_id });
      summary.undecided++;
      log("tagger.undecided", { message_id: row.message_id, reason: result.reason });
      continue;
    }

    const cls = combineClass(rules, result.labels);
    const { data: done, error: tagError } = await admin.rpc("tag_message_data_class", {
      p_message: row.message_id,
      p_class: cls,
      p_source: "model",
      p_detail: { labels: result.labels, confidence: result.confidence, identifiers: rules.identifiers, model: result.completion?.model },
    });
    if (tagError) throw new Error(`tag_message_data_class: ${tagError.message}`);
    if (done) {
      summary.tagged++;
      summary.byModel++;
    }
  }

  log("tagger.run", { ...summary, claimed: rows.length, model: modelOk });
  return summary;
}
