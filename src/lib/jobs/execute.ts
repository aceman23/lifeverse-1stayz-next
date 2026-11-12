import "server-only";
import { runAgent } from "@/lib/messaging/agent";
import { runNotifier } from "@/lib/messaging/notifier";
import { runSender } from "@/lib/messaging/sender";
import { runTagger } from "@/lib/messaging/tagger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { JobName } from "./catalog";

// Composition root. Each unit claims a small amount of durable work.
export async function executeUnit(job: JobName, signal: AbortSignal) {
  signal.throwIfAborted();
  switch (job) {
    case "messages": {
      const result = await runSender({ batches: 1, batchSize: 1, signal });
      return { result, more: result.sent + result.retrying + result.failed > 0 };
    }
    case "tagger": {
      const result = await runTagger({ limit: 1, signal });
      return { result, more: result.tagged + result.undecided > 0 };
    }
    case "agent": {
      const result = await runAgent({ limit: 1, signal });
      return { result, more: result.claimed > 0 };
    }
    case "notifications": {
      const result = await runNotifier({ limit: 1, signal });
      return { result, more: result.sent + result.failed + result.skipped > 0 };
    }
    case "retention": {
      const admin = createAdminClient({ signal });
      if (!admin) throw new Error("Job database not configured");
      const { data, error } = await admin.rpc("compact_stale_threads", {});
      if (error) throw new Error(`retention: ${error.code}`);
      return { result: { compacted: data as number }, more: false };
    }
  }
}
