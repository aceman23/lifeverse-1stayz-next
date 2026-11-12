import { afterEach, describe, expect, it, vi } from "vitest";
import { createModelClient } from "@/lib/ai/client";
import type { CompletionRequest } from "@/lib/ai/types";
import { FAMILIES } from "./first-message";
import { reviewFirstMessage } from "./first-message-review";

const ctx = { churchName: "Grace Church", kidsMinistry: "Grace Kids", tone: ["Warm", "Joyful"] };

afterEach(() => vi.unstubAllEnvs());

describe("first-message review (AI-07, Tier-2)", () => {
  it("reviews the rendered wording with the frontier model, naming the family and tone", async () => {
    const seen: CompletionRequest[] = [];
    const client = createModelClient("onboarding", { stub: (r) => (seen.push(r), '{"labels":["fine"],"confidence":0.9}') });
    const r = await reviewFirstMessage(FAMILIES.family.defaultBody, { ...ctx, family: "family" }, client);
    expect(r).toMatchObject({ verdict: "pass", labels: [], model: "stub-frontier" });
    expect(seen).toHaveLength(1);
    expect(seen[0].role).toBe("frontier");
    expect(seen[0].guestData).toBeFalsy();
    expect(seen[0].system).toContain("guests who came with children");
    expect(seen[0].system).toContain("Warm, Joyful");
    // The template is rendered: no placeholders, no real guest name.
    expect(seen[0].messages[0].content).toContain("Hi Jordan!");
    expect(seen[0].messages[0].content).toContain("Grace Kids");
    expect(seen[0].messages[0].content).not.toContain("{");
  });

  it("concerns are listed; 'fine' alongside a concern doesn't hide it", async () => {
    const client = createModelClient("onboarding", { stub: () => '{"labels":["fine","pressure","claims_human"]}' });
    const r = await reviewFirstMessage("Hi {first_name}! I'm Pastor Dan. Come back Sunday? Reply STOP to opt out.", { ...ctx, family: "welcome" }, client);
    expect(r.verdict).toBe("concerns");
    expect(r.labels.sort()).toEqual(["claims_human", "pressure"]);
  });

  it("an unusable answer is a concern, not a pass", async () => {
    const client = createModelClient("onboarding", { stub: () => "Looks lovely!" });
    const r = await reviewFirstMessage(FAMILIES.welcome.defaultBody, { ...ctx, family: "welcome" }, client);
    expect(r).toMatchObject({ verdict: "concerns", labels: ["unclear"] });
  });

  it("no AI keys: the review is unavailable and the pastor approves without it", async () => {
    vi.stubEnv("AI_STUB", "");
    vi.stubEnv("AI_ONBOARDING_ANTHROPIC_API_KEY", "");
    const r = await reviewFirstMessage(FAMILIES.welcome.defaultBody, { ...ctx, family: "welcome" });
    expect(r).toMatchObject({ verdict: "unavailable", labels: [], model: null });
  });
});
