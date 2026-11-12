import "server-only";
import { logError } from "@/lib/log";
import type { JobName } from "./catalog";
import { executeUnit } from "./execute";
import { runBoundedJob } from "./runner";

// Webhooks/actions can request low-latency work after their response. They use the
// same bounded workers as cron, without pretending the scheduler itself is healthy.
export async function nudgeJob(job: JobName): Promise<void> {
  try {
    await runBoundedJob({ budgetMs: 35_000, maxUnits: 1 }, async (signal) => {
      const unit = await executeUnit(job, signal);
      // An escalation/draft just created by the agent should not wait a full minute.
      // Both follow-ups share the original deadline, rather than resetting it.
      if (job === "agent") {
        await executeUnit("notifications", signal);
        await executeUnit("messages", signal);
      }
      return unit;
    });
  } catch {
    // Work is durable; its independent cron owns retries. Never fail the webhook.
    logError("job.nudge_failed", { job });
  }
}
