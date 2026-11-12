// Scheduling, HTTP validation and health checks share this service-free catalog.
export const JOB_NAMES = ["messages", "tagger", "agent", "notifications", "retention"] as const;
export type JobName = (typeof JOB_NAMES)[number];
export const heartbeatName = (job: JobName) => `cron_${job}`;
export const isJobName = (value: string): value is JobName => JOB_NAMES.some((job) => job === value);
export const JOB_POLICY = { budgetMs: 40_000, maxUnits: 20 } as const;
export const JOB_STALE_AFTER_S = 5 * 60;

export interface Heartbeat {
  name: string;
  at: string;
  details: { status?: string } | null;
}

export function jobHealth(rows: Heartbeat[], nowMs = Date.now()) {
  return Object.fromEntries(JOB_NAMES.map((job) => {
    const row = rows.find((r) => r.name === heartbeatName(job));
    const age = row ? Math.round((nowMs - Date.parse(row.at)) / 1000) : null;
    const ageS = age !== null && Number.isFinite(age) ? age : null;
    const ok = ageS !== null && ageS >= -30 && ageS <= JOB_STALE_AFTER_S &&
      (row?.details?.status === "completed" || row?.details?.status === "yielded");
    return [job, { ok, age_s: ageS }];
  })) as Record<JobName, { ok: boolean; age_s: number | null }>;
}
