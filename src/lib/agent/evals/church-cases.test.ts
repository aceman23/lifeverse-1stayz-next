import { describe, expect, it } from "vitest";
import { assertTenant, pendingGuestText } from "../context";
import { escalationFromRules } from "../escalation";
import { decide } from "../pipeline";
import { createModelClient } from "@/lib/ai/client";
import { churchEvalContext, generateChurchCases, summarizeChurch, type ChurchConfig } from "./church-cases";
import { makeContext } from "./fixture";
import { scoreCase } from "./score";

const fixture = makeContext([]);
const grace: ChurchConfig = { church: fixture.church, guardrails: fixture.guardrails };
const sparse: ChurchConfig = {
  church: { church_id: "c-sparse", name: "New Hope", timezone: "America/Denver", website: null, address: null, services: [], ministries: [] },
  guardrails: { church_id: "c-sparse", version: null, config: null },
};

describe("per-church eval generator (AI-07)", () => {
  const cases = generateChurchCases(grace);
  const byNote = (n: string) => cases.find((c) => c.note === n);

  it("10 must-route and 10 should-answer cases, unique ids, same every time", () => {
    expect(cases.filter((c) => c.kind === "route")).toHaveLength(10);
    expect(cases.filter((c) => c.kind === "answer")).toHaveLength(10);
    expect(new Set(cases.map((c) => c.id)).size).toBe(20);
    expect(generateChurchCases(grace)).toEqual(cases);
  });

  it("builds from the church's own config first", () => {
    expect(byNote("routed belief: End times")?.turns[0].body).toContain("end times");
    expect(byNote("routed belief: Women in leadership")).toBeDefined();
    expect(cases.some((c) => c.note.startsWith("escalation topic: Crisis"))).toBe(true);
    expect(byNote("service times")?.mustInclude).toEqual(["9", "11"]);
    expect(byNote("address")?.mustInclude).toEqual(["1200 Oak Ridge"]);
    expect(byNote("ministry: Grace Kids")?.mustInclude).toContain("Grace Kids");
    expect(byNote("explained belief: Baptism")?.mustInclude).toContain("immersion");
    expect(byNote("skipped topic: Politics")).toBeDefined();
    expect(byNote("website")?.mustInclude).toEqual(["gracecommunity.example"]);
  });

  it("a church with nothing set up still gets 20 cases from the standard pool", () => {
    const s = generateChurchCases(sparse);
    expect(s.filter((c) => c.kind === "route")).toHaveLength(10);
    expect(s.filter((c) => c.kind === "answer")).toHaveLength(10);
  });

  it("the rules catch every case marked rules-catchable, and no should-answer case trips them", () => {
    for (const c of cases) {
      const hit = escalationFromRules(pendingGuestText(churchEvalContext(grace, c.turns)));
      if (c.kind === "route" && c.rules) expect(hit, c.id).not.toBeNull();
      if (c.kind === "answer") expect(hit, c.id).toBeNull();
    }
  });

  it("each case runs in a context of that church only (ISO-2)", () => {
    for (const c of cases) expect(() => assertTenant(churchEvalContext(grace, c.turns), grace.church.church_id)).not.toThrow();
    expect(churchEvalContext(sparse, [{ from: "guest", body: "hi" }]).turns.at(-1)).toMatchObject({ from: "guest", body: "hi", church_id: "c-sparse" });
  });

  it("scores against the church's own context and summarizes against the bar", async () => {
    const client = createModelClient("evals", {
      stub: (r) =>
        r.system?.includes("You review a text reply")
          ? '{"labels":["pass"]}'
          : r.system?.includes("Labels:")
            ? '{"labels":["none"]}'
            : "Services are Sundays at 9:00 and 11:00. Would you like directions?",
    });
    const now = new Date("2026-11-01T18:00:00Z");
    const results = [];
    for (const c of cases) {
      const ctx = churchEvalContext(grace, c.turns);
      const { decision } = await decide(ctx, { fast: client, frontier: client, now, modelAllowed: true, synthetic: true });
      results.push(scoreCase(c, decision, ctx));
    }
    const s = summarizeChurch(results);
    expect(s.routeTotal).toBe(10);
    expect(s.answerTotal).toBe(10);
    // The stub answers everything with service times: rules-caught routes pass, the rest don't.
    expect(results.find((r) => r.id.includes("service-times"))?.pass).toBe(true);
    expect(s.meetsBar).toBe(false);
  });
});
