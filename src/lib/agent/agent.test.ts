import { describe, expect, it } from "vitest";
import { createModelClient } from "@/lib/ai/client";
import type { CompletionRequest } from "@/lib/ai/types";
import { assertTenant, pendingGuestText, TenantMismatchError } from "./context";
import { escalationFromRules } from "./escalation";
import { EVAL_CASES } from "./evals/cases";
import { EVAL_CHURCH_ID, makeContext } from "./evals/fixture";
import { scoreCase } from "./evals/score";
import { DAILY_REPLY_CAP, decide } from "./pipeline";
import { buildReplyMessages, buildReplySystem, checkReply } from "./reply";

const now = new Date("2026-11-01T18:00:00Z");
const ctxOf = (body: string) => makeContext([{ from: "guest", body }]);

/** A stub that answers each step: Tier-1 (escalation labels), the reply, Tier-2. */
function scripted(answers: { tier1?: string; reply?: string; tier2?: string }) {
  const seen: CompletionRequest[] = [];
  const client = createModelClient("evals", {
    stub: (req) => {
      seen.push(req);
      if (req.system?.includes("You review a text reply")) return answers.tier2 ?? '{"labels":["pass"]}';
      if (req.system?.includes("Labels:")) return answers.tier1 ?? '{"labels":["none"]}';
      return answers.reply ?? "Sundays at 9:00 and 11:00. Would you like directions?";
    },
  });
  return { client, seen };
}

describe("ISO-2: assertTenant", () => {
  it("accepts a context that is all one church", () => {
    expect(() => assertTenant(ctxOf("hi"), EVAL_CHURCH_ID)).not.toThrow();
  });
  it("rejects any item from another church, wherever it is", () => {
    const ctx = ctxOf("hi");
    ctx.turns[0]!.church_id = "other-church";
    expect(() => assertTenant(ctx, EVAL_CHURCH_ID)).toThrow(TenantMismatchError);
    const ctx2 = ctxOf("hi");
    ctx2.person.household[0]!.church_id = "other-church";
    expect(() => assertTenant(ctx2, EVAL_CHURCH_ID)).toThrow(/household/);
  });
  it("rejects scoped parts with no church id", () => {
    const ctx = ctxOf("hi");
    delete (ctx.person as { church_id?: string }).church_id;
    expect(() => assertTenant(ctx, EVAL_CHURCH_ID)).toThrow(TenantMismatchError);
  });
});

describe("escalation rules (no model)", () => {
  it.each(EVAL_CASES.filter((c) => c.kind === "route" && c.rules).map((c) => [c.id, c] as const))(
    "%s is caught by the rules alone",
    (_id, c) => {
      expect(escalationFromRules(pendingGuestText(makeContext(c.turns)))).not.toBeNull();
    },
  );
  it.each(EVAL_CASES.filter((c) => c.kind === "answer").map((c) => [c.id, c] as const))("%s doesn't trip the rules", (_id, c) => {
    expect(escalationFromRules(pendingGuestText(makeContext(c.turns)))).toBeNull();
  });
  it("crisis wins over care", () => {
    expect(escalationFromRules("please pray, I don't want to live anymore")?.reason).toBe("crisis");
  });
  it("a parent mentioning a child's age isn't a minor", () => {
    expect(escalationFromRules("My son is 12, is there a youth group?")).toBeNull();
    expect(escalationFromRules("I'm 16 years old")?.reason).toBe("other");
  });
});

describe("decide", () => {
  it("rules escalate without any model call", async () => {
    const { client, seen } = scripted({});
    const { decision, calls } = await decide(ctxOf("Can you pray for my sister?"), { fast: client, frontier: client, now, modelAllowed: true });
    expect(decision).toMatchObject({ type: "escalate", reason: "care", source: "rules" });
    expect(seen).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("no model allowed (AI-02): skip, staff answer", async () => {
    const { client, seen } = scripted({});
    const { decision } = await decide(ctxOf("What time is church?"), { fast: client, frontier: client, now, modelAllowed: false });
    expect(decision).toEqual({ type: "skip", reason: "no_model" });
    expect(seen).toHaveLength(0);
  });

  it("Tier-1 escalates when the model isn't sure the assistant can answer", async () => {
    const { client } = scripted({ tier1: '{"labels":["care"],"confidence":0.7}' });
    const { decision, calls } = await decide(ctxOf("rough week"), { fast: client, frontier: client, now, modelAllowed: true });
    expect(decision).toMatchObject({ type: "escalate", reason: "care", source: "model" });
    expect(calls.map((c) => c.purpose)).toEqual(["escalation"]);
  });

  it("an unclear Tier-1 answer escalates", async () => {
    const { client } = scripted({ tier1: "hmm" });
    const { decision } = await decide(ctxOf("what time?"), { fast: client, frontier: client, now, modelAllowed: true });
    expect(decision).toMatchObject({ type: "escalate", source: "model" });
  });

  it("drafts a reply that passes Tier-2 and the checks", async () => {
    const { client, seen } = scripted({});
    const { decision, calls } = await decide(ctxOf("What time are services?"), { fast: client, frontier: client, now, modelAllowed: true });
    expect(decision).toMatchObject({ type: "reply", channel: "sms", hold: false, detail: { tier2: "pass", problems: [] } });
    expect(calls.map((c) => [c.purpose, c.tier2])).toEqual([
      ["escalation", null],
      ["reply", null],
      ["tier2", "pass"],
    ]);
    // Guest data flag on every call, frontier for Tier-2.
    expect(seen.every((r) => r.guestData === true)).toBe(true);
    expect(seen[2]!.role).toBe("frontier");
  });

  it("Tier-2 can still send it to a person", async () => {
    const { client } = scripted({ tier2: '{"labels":["escalate_theology"]}' });
    const { decision } = await decide(ctxOf("Is the Bible literal?"), { fast: client, frontier: client, now, modelAllowed: true });
    expect(decision).toMatchObject({ type: "escalate", reason: "theology", source: "tier2" });
  });

  it("a blocked or unclear Tier-2 answer holds the draft for staff", async () => {
    for (const tier2 of ['{"labels":["block"]}', "not sure"]) {
      const { client } = scripted({ tier2 });
      const { decision } = await decide(ctxOf("What time?"), { fast: client, frontier: client, now, modelAllowed: true });
      expect(decision).toMatchObject({ type: "reply", hold: true });
    }
  });

  it("a draft that breaks a rule is held", async () => {
    const { client } = scripted({ reply: "Hi! Want to come Sunday? Bring the kids? Need a ride?" });
    const { decision } = await decide(ctxOf("hi"), { fast: client, frontier: client, now, modelAllowed: true });
    expect(decision).toMatchObject({ type: "reply", hold: true, detail: { problems: ["more_than_one_question"] } });
  });

  it("daily cap: staff take it from there", async () => {
    const { client } = scripted({});
    const ctx = makeContext([{ from: "guest", body: "one more question" }], { assistant_replies_24h: DAILY_REPLY_CAP });
    expect((await decide(ctx, { fast: client, frontier: client, now, modelAllowed: true })).decision).toEqual({ type: "skip", reason: "daily_cap" });
  });

  it("synthetic eval runs aren't marked as guest data", async () => {
    const { client, seen } = scripted({});
    await decide(ctxOf("What time?"), { fast: client, frontier: client, now, modelAllowed: true, synthetic: true });
    expect(seen.every((r) => r.guestData === false)).toBe(true);
  });
});

describe("reply prompt and checks", () => {
  const ctx = ctxOf("hi");
  it("puts the church's rules and facts in the system prompt", () => {
    const system = buildReplySystem(ctx, now);
    expect(system).toContain("Never claim or imply to be human");
    expect(system).toContain("ONE question");
    expect(system).toContain("Sunday 9:00 AM (Traditional)");
    expect(system).toContain('"We practice believer\'s baptism by immersion');
    expect(system).toContain("Questions about these go to a pastor; don't answer them yourself: End times; Women in leadership");
    expect(system).toContain("Do not discuss these topics");
  });
  it("starts the conversation with the guest and merges consecutive turns", () => {
    const msgs = buildReplyMessages(makeContext([{ from: "guest", body: "a" }, { from: "guest", body: "b" }]));
    expect(msgs).toEqual([{ role: "user", content: "a\nb" }]);
  });
  it("flags long, multi-question, human-claiming and off-site links", () => {
    expect(checkReply("x".repeat(321), ctx, "sms")).toContain("too_long");
    expect(checkReply("x".repeat(321), ctx, "email")).toEqual([]);
    expect(checkReply("Hi? There?", ctx, "sms")).toContain("more_than_one_question");
    expect(checkReply("Yes, I'm a real person!", ctx, "sms")).toContain("claims_to_be_human");
    expect(checkReply("See https://evil.example/x", ctx, "sms")).toContain("unknown_link");
    expect(checkReply("See https://gracecommunity.example/visit", ctx, "sms")).toEqual([]);
  });
});

describe("eval scoring", () => {
  it("route cases need an escalation; answer cases need a clean, unheld reply", () => {
    const route = EVAL_CASES.find((c) => c.id === "crisis-1")!;
    const answer = EVAL_CASES.find((c) => c.id === "answer-1")!;
    expect(scoreCase(route, { type: "escalate", reason: "crisis", source: "rules", detail: {} }).pass).toBe(true);
    expect(scoreCase(route, { type: "skip", reason: "no_model" }).pass).toBe(false);
    expect(scoreCase(answer, { type: "reply", body: "Sundays at 9:00 and 11:00!", channel: "sms", hold: false, detail: {} }).pass).toBe(true);
    expect(scoreCase(answer, { type: "reply", body: "Sundays at 10:30!", channel: "sms", hold: false, detail: {} }).pass).toBe(false);
    expect(scoreCase(answer, { type: "reply", body: "Sundays at 9 and 11", channel: "sms", hold: true, detail: {} }).pass).toBe(false);
  });
  it("has 40 cases, half must-route", () => {
    expect(EVAL_CASES).toHaveLength(40);
    expect(EVAL_CASES.filter((c) => c.kind === "route")).toHaveLength(20);
    expect(new Set(EVAL_CASES.map((c) => c.id)).size).toBe(40);
  });
});

describe("no model: why", () => {
  it("reports the budget or the kill switch as the reason", async () => {
    const { client } = scripted({});
    for (const reason of ["ai_budget", "agent_off"]) {
      const { decision } = await decide(ctxOf("What time?"), { fast: client, frontier: client, now, modelAllowed: false, noModelReason: reason });
      expect(decision).toEqual({ type: "skip", reason });
    }
    // Rules still escalate when the model is off.
    const { decision } = await decide(ctxOf("please pray for us"), { fast: client, frontier: client, now, modelAllowed: false, noModelReason: "agent_off" });
    expect(decision).toMatchObject({ type: "escalate", source: "rules" });
  });
});

describe("compacted conversations (DB-05)", () => {
  it("tells the model there was an earlier conversation, never what was said", () => {
    const ctx = ctxOf("Hi again! Is there a Christmas service?");
    ctx.thread = {
      ...ctx.thread,
      earlier: {
        messages: 3,
        guest_messages: 1,
        first_at: "2026-09-20T15:00:00Z",
        last_at: "2026-09-21T15:00:00Z",
        last_guest_at: "2026-09-21T15:00:00Z",
        data_classes: ["C3"],
        escalation_reason: "care",
        escalation_answered: true,
        followup_state: null,
        coming_back_on: null,
        status: "open",
      },
    };
    const system = buildReplySystem(ctx, now);
    expect(system).toContain("You talked before, until September 21; you can't see those messages.");
    expect(system).toContain("The guest wrote 1 time.");
    expect(system).toContain("A pastor followed up with them personally.");
    expect(() => assertTenant(ctx, EVAL_CHURCH_ID)).not.toThrow();
  });
  it("no earlier conversation, no line", () => {
    expect(buildReplySystem(ctxOf("hi"), now)).not.toContain("You talked before");
  });
});
