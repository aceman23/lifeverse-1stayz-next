import "server-only";
import { timingSafeEqual } from "node:crypto";
import { log, logError } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/admin";
import { heartbeatName, JOB_POLICY, type JobName } from "./catalog";
import { executeUnit } from "./execute";
import { runBoundedJob } from "./runner";

export async function handleJob(request: Request, job: JobName): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ error: "unavailable" }, 503);
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return json({ error: "unauthorized" }, 401);
  if (!createAdminClient()) return json({ error: "unavailable" }, 503);

  const heartbeat = async (status: string, units = 0) => {
    // Work cancellation must not cancel the subsequent health write.
    const admin = createAdminClient({ signal: AbortSignal.timeout(5_000) })!;
    const { error } = await admin.from("ops_heartbeats").upsert({
      name: heartbeatName(job), at: new Date().toISOString(), details: { status, units },
    });
    if (error) throw new Error(`heartbeat: ${error.code}`);
  };
  const started = Date.now();
  try {
    const result = await runBoundedJob(JOB_POLICY, (signal) => executeUnit(job, signal));
    await heartbeat(result.status, result.units);
    log("cron.job", { job, status: result.status, units: result.units, ms: Date.now() - started });
    return json({ job, ...result }, result.status === "timed_out" ? 503 : 200);
  } catch {
    logError("cron.job_failed", { job, ms: Date.now() - started });
    await heartbeat("failed").catch(() => {});
    return json({ error: "failed", job }, 500);
  }
}
