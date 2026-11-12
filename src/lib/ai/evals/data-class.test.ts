import { describe, expect, it } from "vitest";
import { applyRules, classFromRules } from "../data-class";
import { DATA_CLASS_CASES } from "./data-class-cases";
import { scoreDataClass } from "./data-class-score";

// The part of the AI-05 set the rules alone must settle, checked without a model on every PR.

describe("data-class set: rules", () => {
  it("has a balanced, unique set", () => {
    expect(new Set(DATA_CLASS_CASES.map((c) => c.id)).size).toBe(DATA_CLASS_CASES.length);
    for (const cls of ["C1", "C2", "C3"]) expect(DATA_CLASS_CASES.filter((c) => c.cls === cls).length).toBeGreaterThanOrEqual(12);
  });
  it.each(DATA_CLASS_CASES.filter((c) => c.rules && c.cls === "C3").map((c) => [c.id, c] as const))("%s: sensitive by rules", (_id, c) => {
    expect(classFromRules(applyRules(c.text, c.names ?? []))).toBe("C3");
  });
  it.each(DATA_CLASS_CASES.filter((c) => c.rules && c.cls === "C1").map((c) => [c.id, c] as const))("%s: identifier found, not sensitive", (_id, c) => {
    const r = applyRules(c.text, c.names ?? []);
    expect(r.sensitive).toEqual([]);
    expect(r.identifiers.length).toBeGreaterThan(0);
  });
  it.each(DATA_CLASS_CASES.filter((c) => c.rules && c.cls === "C2").map((c) => [c.id, c] as const))("%s: no rule fires", (_id, c) => {
    expect(applyRules(c.text, c.names ?? [])).toEqual({ sensitive: [], identifiers: [] });
  });
});

describe("data-class scoring", () => {
  it("a missed sensitive message fails the bar; over-tagging costs precision", () => {
    const ok = scoreDataClass([
      { id: "a", expected: "C3", got: "C3", source: "rules" },
      { id: "b", expected: "C2", got: "C2", source: "model" },
    ]);
    expect(ok.meetsBar).toBe(true);
    const missed = scoreDataClass([{ id: "a", expected: "C3", got: "C2", source: "model" }]);
    expect(missed.sensitiveMissed).toEqual(["a"]);
    expect(missed.meetsBar).toBe(false);
    const over = scoreDataClass([
      { id: "a", expected: "C3", got: "C3", source: "rules" },
      { id: "b", expected: "C2", got: "C3", source: "model" },
    ]);
    expect(over.C3.precision).toBe(0.5);
    expect(over.meetsBar).toBe(false);
  });
});
