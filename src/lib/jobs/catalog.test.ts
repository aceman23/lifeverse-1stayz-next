import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { JOB_NAMES, heartbeatName, isJobName, jobHealth, type Heartbeat } from "./catalog";

const now = Date.parse("2026-11-04T12:00:00Z");
const fresh = (): Heartbeat[] => JOB_NAMES.map((job) => ({ name: heartbeatName(job), at: new Date(now).toISOString(), details: { status: "completed" } }));

describe("job health and scheduling contract", () => {
  it("requires all independent jobs to have recent successful health records", () => {
    expect(Object.values(jobHealth(fresh(), now)).every((job) => job.ok)).toBe(true);
    const rows = fresh();
    rows.find((r) => r.name === "cron_agent")!.details = { status: "failed" };
    expect(jobHealth(rows, now).agent.ok).toBe(false);
    expect(jobHealth(rows, now).messages.ok).toBe(true);
  });

  it("rejects missing, stale, malformed and far-future health records", () => {
    expect(jobHealth([], now).agent.ok).toBe(false);
    for (const at of [new Date(now - 301_000).toISOString(), "invalid", new Date(now + 60_000).toISOString()]) {
      const rows = fresh(); rows[0].at = at;
      expect(jobHealth(rows, now).messages.ok).toBe(false);
    }
  });

  it("accepts bounded yields and refuses unknown job names", () => {
    const rows = fresh(); rows[0].details = { status: "yielded" };
    expect(jobHealth(rows, now).messages.ok).toBe(true);
    expect(isJobName("messages")).toBe(true);
    expect(isJobName("arbitrary_function")).toBe(false);
  });

  it("deploys every job independently at the cadence expected by health", () => {
    const config = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8"));
    expect(config.crons).toEqual(JOB_NAMES.map((job) => ({ path: `/api/cron/${job}`, schedule: "* * * * *" })));
  });
});
