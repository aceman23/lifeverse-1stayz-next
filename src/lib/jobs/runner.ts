// Framework-free execution policy. Cancellation belongs to one invocation.
export interface JobPolicy { budgetMs: number; maxUnits: number }
export interface JobRun {
  status: "completed" | "yielded" | "timed_out";
  units: number;
  results: unknown[];
}

export async function runBoundedJob(
  policy: JobPolicy,
  execute: (signal: AbortSignal) => Promise<{ result: unknown; more: boolean }>,
): Promise<JobRun> {
  if (!Number.isFinite(policy.budgetMs) || policy.budgetMs <= 0 || !Number.isInteger(policy.maxUnits) || policy.maxUnits < 1) {
    throw new Error("Invalid job execution policy");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Job deadline reached", "TimeoutError")), policy.budgetMs);
  const results: unknown[] = [];
  try {
    for (let i = 0; i < policy.maxUnits; i++) {
      controller.signal.throwIfAborted();
      const unit = await execute(controller.signal);
      controller.signal.throwIfAborted();
      results.push(unit.result);
      if (!unit.more) return { status: "completed", units: results.length, results };
    }
    return { status: "yielded", units: results.length, results };
  } catch (error) {
    // Wait for transports to acknowledge cancellation; never leave a Promise.race
    // loser running. Durable rows are retried after their database lease expires.
    if (controller.signal.aborted) return { status: results.length ? "yielded" : "timed_out", units: results.length, results };
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
