import { describe, expect, it } from "vitest";
import { escalationBrief, nextAction, type BriefInput } from "./escalation-brief";

const base: BriefInput = {
  reason: "care",
  source: "rules",
  firstName: "Hannah",
  visitCount: 1,
  serviceName: "Sunday 9:00",
  interests: ["Kids", "Small groups", "Choir", "Missions"],
  householdSize: 2,
  guestMessages: 3,
  hasPhone: true,
  channel: "sms",
};

describe("escalationBrief", () => {
  it("summarises who flagged it, the visit and the conversation, without guest words", () => {
    const { summary } = escalationBrief(base);
    expect(summary[0]).toBe("The assistant's safety rules flagged this message as a care or prayer need.");
    expect(summary[1]).toBe("First visit (Sunday 9:00), came with 2 others.");
    expect(summary).toContain("Interested in Kids, Small groups, Choir.");
    expect(summary).toContain("Hannah has written 3 times on this conversation.");
    expect(summary.at(-1)).toBe("The assistant won't reply until someone on your team does.");
  });

  it("names the staff member who flagged it", () => {
    const { summary } = escalationBrief({ ...base, source: "staff", flaggedBy: "Ray", reason: "meet_pastor" });
    expect(summary[0]).toBe("Ray flagged this as a request to talk with a pastor.");
  });

  it("mentions earlier escalations and a planned return", () => {
    const { summary } = escalationBrief({ ...base, earlierEscalations: 1, comingBackOn: "Sun, Nov 15", guestMessages: 1, householdSize: 0, interests: [] });
    expect(summary).toContain("Flagged once before, on an earlier visit.");
    expect(summary).toContain("Said they're coming back on Sun, Nov 15.");
    expect(summary).toContain("Hannah has written once on this conversation.");
    expect(summary.some((l) => l.startsWith("Interested"))).toBe(false);
  });

  it("unknown reasons fall back safely", () => {
    expect(escalationBrief({ ...base, reason: "something_new" }).summary[0]).toContain("something a person should answer");
  });
});

describe("nextAction", () => {
  it("crisis: call now, crisis plan and 988", () => {
    const a = nextAction("crisis", "Sam", true, "sms");
    expect(a.title).toBe("Call Sam now");
    expect(a.steps.join(" ")).toContain("988");
    expect(nextAction("crisis", "Sam", false, "email").title).toBe("Reply to Sam now");
  });
  it("each reason has a concrete step on the guest's channel", () => {
    expect(nextAction("care", "Sam", false, "email").steps[0]).toContain("by email");
    expect(nextAction("theology", "Sam", true, "sms").title).toBe("A pastor answers their question");
    expect(nextAction("meet_pastor", "Sam", true, "sms").title).toBe("Set up a time with a pastor");
    expect(nextAction("other", "Sam", true, "sms").title).toBe("Reply to Sam personally");
  });
});

describe("formatWait", async () => {
  const { formatWait } = await import("@/lib/format");
  it("reads well at any length", () => {
    expect(formatWait(12)).toBe("12 min");
    expect(formatWait(125)).toBe("2 h 5 min");
    expect(formatWait(180)).toBe("3 h");
    expect(formatWait(3614)).toBe("2 days 12 h");
    expect(formatWait(1440)).toBe("1 day");
  });
});
