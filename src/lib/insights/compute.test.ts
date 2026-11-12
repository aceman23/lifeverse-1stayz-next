import { describe, expect, it } from "vitest";
import { computeInsights, median, recentWeeks, weekOf, type ThreadFacts } from "./compute";

const TZ = "America/Chicago";
// Tue 10 Nov 2026, 15:00 Chicago.
const now = new Date("2026-11-10T21:00:00Z");

let n = 0;
function thread(over: Partial<ThreadFacts>): ThreadFacts {
  n++;
  return {
    threadId: `t${n}`,
    channel: "sms",
    status: "open",
    createdAt: "2026-11-08T17:00:00Z",
    firstContactSentAt: "2026-11-08T17:20:00Z",
    latencyS: 600,
    onTime: true,
    lastInboundAt: null,
    escalatedAt: null,
    escalationAnsweredAt: null,
    closedAt: null,
    sentAfterStop: false,
    ...over,
  };
}

describe("weeks", () => {
  it("weeks start on Sunday in church time", () => {
    expect(weekOf("2026-11-08T17:00:00Z", TZ)).toBe("2026-11-08"); // Sun morning
    expect(weekOf("2026-11-14T23:00:00Z", TZ)).toBe("2026-11-08"); // Sat evening
    // Sun 1:00 UTC is still Saturday evening in Chicago.
    expect(weekOf("2026-11-15T01:00:00Z", TZ)).toBe("2026-11-08");
    expect(weekOf("2026-11-15T07:00:00Z", TZ)).toBe("2026-11-15");
  });
  it("a DST change doesn't shift the week", () => {
    // DST ends Sun 1 Nov 2026 in the US.
    expect(weekOf("2026-11-01T06:30:00Z", TZ)).toBe("2026-11-01");
    expect(weekOf("2026-11-07T22:00:00Z", TZ)).toBe("2026-11-01");
  });
  it("lists recent weeks newest first", () => {
    expect(recentWeeks(now, TZ, 3)).toEqual(["2026-11-08", "2026-11-01", "2026-10-25"]);
  });
  it("median", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("computeInsights", () => {
  it("measures the pilot targets over the range", () => {
    const threads = [
      thread({ lastInboundAt: "2026-11-08T18:00:00Z", escalatedAt: "2026-11-08T18:01:00Z", escalationAnsweredAt: "2026-11-08T18:09:00Z" }),
      thread({ onTime: false, latencyS: 2400 }),
      thread({ firstContactSentAt: null, latencyS: null, onTime: null }),
      thread({ status: "opted_out", closedAt: "2026-11-08T18:30:00Z" }),
      thread({ status: "opted_out", closedAt: "2026-11-08T18:30:00Z", sentAfterStop: true }),
      // Outside the range: ignored.
      thread({ createdAt: "2026-09-01T17:00:00Z", onTime: false }),
    ];
    const { targets, weeks, channels } = computeInsights(threads, [{ at: "2026-11-08T17:10:00Z", delayS: 300 }], { tz: TZ, now, weeks: 4 });
    const t = Object.fromEntries(targets.map((x) => [x.key, x]));
    expect(t.first_on_time).toMatchObject({ current: "75%", onTrack: false, basis: "4 first texts" });
    expect(t.reply_rate).toMatchObject({ current: "25%", onTrack: false });
    expect(t.time_to_human).toMatchObject({ current: "8 min", onTrack: true, basis: "1 answered escalation" });
    expect(t.stop_honored).toMatchObject({ current: "50%", onTrack: false, basis: "2 opt-outs" });

    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toMatchObject({
      weekOf: "2026-11-08",
      guests: 5,
      firstContacts: 4,
      onTimePct: 0.75,
      escalations: 1,
      medianTimeToHumanMin: 8,
      optedOut: 2,
      approvals: 1,
      medianApprovalMin: 5,
    });
    expect(weeks[0]!.medianFirstContactMin).toBe(10);
    expect(weeks[1]).toMatchObject({ guests: 0, firstContacts: 0, onTimePct: null, replyPct: null });
    expect(channels.find((c) => c.channel === "sms")).toMatchObject({ threads: 5, firstContacts: 4, replyPct: 0.25 });
    expect(channels.find((c) => c.channel === "email")).toMatchObject({ threads: 0, replyPct: null });
  });

  it("nothing to measure: no targets judged", () => {
    const { targets } = computeInsights([], [], { tz: TZ, now, weeks: 8 });
    expect(targets.every((t) => t.onTrack === null && t.current === "—")).toBe(true);
  });

  it("an escalation counts in the week it happened", () => {
    const visit = thread({ createdAt: "2026-11-05T17:00:00Z", escalatedAt: "2026-11-09T15:00:00Z", escalationAnsweredAt: "2026-11-09T15:20:00Z" });
    const { weeks } = computeInsights([visit], [], { tz: TZ, now, weeks: 2 });
    expect(weeks[0]).toMatchObject({ weekOf: "2026-11-08", guests: 0, escalations: 1, medianTimeToHumanMin: 20 });
    expect(weeks[1]).toMatchObject({ weekOf: "2026-11-01", guests: 1, escalations: 0 });
  });
});
