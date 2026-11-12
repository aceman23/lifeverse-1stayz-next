import { describe, expect, it } from "vitest";
import { createModelClient } from "@/lib/ai/client";
import { makeContext } from "./evals/fixture";
import { comingBackDate, extractState, stateFromRules } from "./state";

const TZ = "America/Chicago";
// Tue 3 Nov 2026, 10:00 Chicago.
const tue = new Date("2026-11-03T16:00:00Z");
// Sun 8 Nov 2026, 13:00 Chicago.
const sun = new Date("2026-11-08T19:00:00Z");

describe("stateFromRules", () => {
  it.each([
    ["See you Sunday!", ["coming_back"]],
    ["We'll be back next week with my wife and our kids", ["coming_back", "has_kids", "has_spouse"]],
    ["We just moved here. Is there a youth group for my daughter?", ["has_kids", "recently_moved", "interest_youth"]],
    ["Do you have small groups or a Bible study?", ["interest_groups"]],
    ["I'd love to volunteer", ["interest_serving"]],
    ["Is there a nursery?", ["interest_kids"]],
  ])("%s", (text, labels) => {
    expect([...stateFromRules(text)].sort()).toEqual([...labels].sort());
  });
  it("not coming isn't coming back", () => {
    expect(stateFromRules("Sorry, we can't make it Sunday")).toEqual(new Set());
    expect(stateFromRules("We won't be coming back")).toEqual(new Set());
  });
  it("ordinary questions record nothing", () => {
    expect(stateFromRules("What time is church?")).toEqual(new Set());
  });
});

describe("comingBackDate", () => {
  it("the day they name, always in the future", () => {
    expect(comingBackDate("See you Sunday", TZ, tue)).toBe("2026-11-08");
    expect(comingBackDate("See you Sunday", TZ, sun)).toBe("2026-11-15");
    expect(comingBackDate("see you wednesday night", TZ, tue)).toBe("2026-11-04");
    expect(comingBackDate("we'll come back tomorrow", TZ, tue)).toBe("2026-11-04");
  });
  it("no day: the church's next service day, or Sunday", () => {
    expect(comingBackDate("we'll be back", TZ, tue)).toBe("2026-11-08");
    expect(comingBackDate("we'll be back", TZ, tue, ["Wednesday", "Sunday"])).toBe("2026-11-04");
    expect(comingBackDate("we'll be back next week", TZ, tue)).toBe("2026-11-15");
  });
});

describe("extractState", () => {
  const ctx = makeContext([{ from: "guest", body: "x" }]);

  it("rules only when no model is allowed: facts are labels, not the guest's words", async () => {
    const { update, completion } = await extractState(ctx, { fast: createModelClient("evals", { stub: () => "{}" }), now: tue, modelAllowed: false }, "See you Sunday! My kids loved it.");
    expect(completion).toBeNull();
    expect(update.comingBackOn).toBe("2026-11-08");
    expect(update.facts).toEqual([
      { field: "plans", value: "Said they're coming back", source: "guest" },
      { field: "household", value: "Mentioned their kids", source: "guest" },
    ]);
  });

  it("the model adds what the rules miss, from the fixed labels", async () => {
    const fast = createModelClient("evals", { stub: () => '{"labels":["interest_music","has_spouse"]}' });
    const { update, completion } = await extractState(ctx, { fast, now: tue, modelAllowed: true, synthetic: true }, "Loved the songs. Me and Dana will try the choir.");
    expect(completion).not.toBeNull();
    expect(update.facts.map((f) => [f.value, f.source])).toEqual([
      ["Interested in music or worship", "guest"],
      ["Mentioned their spouse", "model"],
    ]);
  });

  it("an unclear model answer records nothing extra", async () => {
    const fast = createModelClient("evals", { stub: () => "not sure" });
    const { update } = await extractState(ctx, { fast, now: tue, modelAllowed: true, synthetic: true }, "Thanks!");
    expect(update).toEqual({ comingBackOn: null, facts: [] });
  });
});
