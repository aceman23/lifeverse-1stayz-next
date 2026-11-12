import { describe, expect, it } from "vitest";
import { diffGuardrails } from "./guardrail-diff";

const v1 = {
  tone: ["Warm", "Casual"],
  sign_off: "The team at Grace",
  positions: [
    { topic: "Baptism", stance: "explain", wording: "We baptize by immersion." },
    { topic: "End times", stance: "route", wording: "" },
    { topic: "Politics", stance: "skip", wording: "" },
  ],
  escalation_topics: ["Crisis or self-harm", "Money or benevolence"],
  documents: ["Statement of faith.pdf"],
};

describe("guardrail version diff (AI-06)", () => {
  it("first version: everything is added", () => {
    const d = diffGuardrails(null, v1);
    expect(d.every((c) => c.kind === "added")).toBe(true);
    expect(d).toContainEqual({ kind: "added", area: "Belief or practice", text: "End times: goes to a pastor" });
    expect(d).toHaveLength(2 + 1 + 3 + 2 + 1);
  });

  it("same config: no changes, regardless of case or order", () => {
    expect(diffGuardrails(v1, { ...v1, tone: ["casual", "warm "], escalation_topics: [...v1.escalation_topics].reverse() })).toEqual([]);
  });

  it("names each kind of change in plain words", () => {
    const v2 = {
      ...v1,
      tone: ["Warm", "Joyful"],
      sign_off: "Grace Church",
      positions: [
        { topic: "Baptism", stance: "explain", wording: "We baptize by immersion a few times a year." },
        { topic: "End times", stance: "skip", wording: "" },
        { topic: "Communion", stance: "explain", wording: "Open to all believers." },
      ],
      escalation_topics: ["Crisis or self-harm", "Anyone under 18"],
      documents: [],
    };
    expect(diffGuardrails(v1, v2)).toEqual([
      { kind: "added", area: "Tone", text: "Joyful" },
      { kind: "removed", area: "Tone", text: "Casual" },
      { kind: "changed", area: "Sign-off", text: "“The team at Grace” → “Grace Church”" },
      { kind: "changed", area: "Belief or practice", text: "Baptism: new wording" },
      { kind: "changed", area: "Belief or practice", text: "End times: goes to a pastor → doesn't discuss" },
      { kind: "added", area: "Belief or practice", text: "Communion: answers with your wording" },
      { kind: "removed", area: "Belief or practice", text: "Politics" },
      { kind: "added", area: "Goes to a person", text: "Anyone under 18" },
      { kind: "removed", area: "Goes to a person", text: "Money or benevolence" },
      { kind: "removed", area: "Reference document", text: "Statement of faith.pdf" },
    ]);
  });

  it("tolerates missing fields in old versions", () => {
    expect(diffGuardrails({}, { tone: null, positions: null })).toEqual([]);
    expect(diffGuardrails({ sign_off: "A" }, {})).toEqual([{ kind: "removed", area: "Sign-off", text: "A" }]);
  });
});
