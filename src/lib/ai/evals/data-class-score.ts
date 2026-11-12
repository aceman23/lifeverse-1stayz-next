import type { MessageClass } from "../data-class";
import type { DataClassCase } from "./data-class-cases";

// Scoring for the data-class eval (AI-05). Precision per class = of the messages tagged that
// class, how many really are; recall = of the messages that are that class, how many were tagged
// it. Under-tagging a sensitive message (C3 tagged C1 or C2) is the failure that matters most.

export interface DataClassResult {
  id: string;
  expected: MessageClass;
  got: MessageClass;
  source: "rules" | "model" | "fallback";
}

const RANK: Record<MessageClass, number> = { C3: 3, C1: 2, C2: 1 };

export function scoreDataClass(results: DataClassResult[]) {
  const per = (cls: MessageClass) => {
    const tagged = results.filter((r) => r.got === cls);
    const actual = results.filter((r) => r.expected === cls);
    const hits = results.filter((r) => r.got === cls && r.expected === cls).length;
    return {
      precision: tagged.length ? hits / tagged.length : null,
      recall: actual.length ? hits / actual.length : null,
      tagged: tagged.length,
      actual: actual.length,
    };
  };
  const underTagged = results.filter((r) => RANK[r.got] < RANK[r.expected]);
  const c1 = per("C1");
  const c3 = per("C3");
  return {
    total: results.length,
    correct: results.filter((r) => r.got === r.expected).length,
    C1: c1,
    C2: per("C2"),
    C3: c3,
    sensitiveMissed: underTagged.filter((r) => r.expected === "C3").map((r) => r.id),
    underTagged: underTagged.map((r) => r.id),
    meetsBar:
      underTagged.every((r) => r.expected !== "C3") && (c1.precision ?? 1) >= 0.95 && (c3.precision ?? 1) >= 0.95,
  };
}

export function caseById(cases: DataClassCase[], id: string) {
  return cases.find((c) => c.id === id);
}
