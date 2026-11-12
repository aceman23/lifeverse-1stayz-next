import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { errorMessage, logError } from "@/lib/log";

// DB-08 / AI-05: security events go to the security_events table (ids and codes only), on top
// of the log line. Recording never fails the request that found the problem.

export type SecurityEventKind = "tenant_mismatch" | "webhook_bad_signature" | "intake_bad_key" | "cross_tenant_denied";

export async function recordSecurityEvent(
  admin: SupabaseClient | null,
  kind: SecurityEventKind,
  source: string,
  where: { churchId?: string | null; threadId?: string | null; details?: Record<string, string | number | boolean | null> } = {},
): Promise<void> {
  if (!admin) return;
  try {
    const { error } = await admin.rpc("record_security_event", {
      p_kind: kind,
      p_source: source,
      p_church: where.churchId ?? null,
      p_thread: where.threadId ?? null,
      p_details: where.details ?? {},
    });
    if (error) logError("security.record_failed", { kind, message: error.message });
  } catch (e) {
    logError("security.record_failed", { kind, message: errorMessage(e) });
  }
}
