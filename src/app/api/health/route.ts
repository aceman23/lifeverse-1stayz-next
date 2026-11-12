import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { heartbeatName, JOB_NAMES, jobHealth, type Heartbeat } from "@/lib/jobs/catalog";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Health requires every scheduled worker, rather than only a successful sender.
export async function GET() {
  const json = (body: unknown, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const admin = createAdminClient({ signal: AbortSignal.timeout(5_000) });
  if (!admin) return json({ ok: false, reason: "not_configured" }, 503);
  try {
    const { data, error } = await admin.from("ops_heartbeats").select("name, at, details").in("name", JOB_NAMES.map(heartbeatName));
    if (error) throw new Error("database");
    const jobs = jobHealth((data ?? []) as Heartbeat[]);
    const ok = JOB_NAMES.every((job) => jobs[job].ok);
    return json({ ok, cron_age_s: jobs.messages.age_s, reason: ok ? null : "jobs_unhealthy", jobs }, ok ? 200 : 503);
  } catch {
    logError("health.db_error");
    return json({ ok: false, reason: "database" }, 503);
  }
}
