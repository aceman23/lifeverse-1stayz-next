import type { SupabaseClient } from "@supabase/supabase-js";
import { log } from "@/lib/log";
import { maskPrompt } from "./mask";
import type { CompletionResult } from "./types";

// DB-07: every model call on a guest's thread leaves its prompt in the church's prompt log, with
// C1 and C3 masked here, before anything is written (guidelines §4.4). Never fails the caller:
// a missing log row is logged (ids only) and the run carries on.

export interface PromptLogEntry {
  churchId: string;
  threadId: string | null;
  messageId?: string | null;
  purpose: string;
  guardrailVersion: number | null;
  completion: CompletionResult;
  /** Names to mask: the guest's and their household's. */
  names: readonly (string | null | undefined)[];
}

export async function logPrompt(admin: SupabaseClient, e: PromptLogEntry): Promise<void> {
  if (!e.completion.prompt) return;
  const names = e.names.filter((n): n is string => typeof n === "string" && n.trim().length > 0);
  const { error } = await admin.rpc("log_prompt", {
    p_church: e.churchId,
    p_thread: e.threadId,
    p_message: e.messageId ?? null,
    p_purpose: e.purpose,
    p_model: e.completion.model,
    p_guardrail_version: e.guardrailVersion,
    p_prompt: maskPrompt(e.completion.prompt, names),
  });
  if (error) log("ai.prompt_log_error", { church_id: e.churchId, thread_id: e.threadId, code: error.code });
}
