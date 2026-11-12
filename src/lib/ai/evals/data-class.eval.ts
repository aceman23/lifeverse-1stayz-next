import { existsSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { classify } from "../classify";
import { createModelClient } from "../client";
import { modelFor } from "../config";
import { applyRules, classFromRules, combineClass, DATA_CLASS_FALLBACK, DATA_CLASS_LABELS, DATA_CLASS_TASK, type MessageClass } from "../data-class";
import { DATA_CLASS_CASES } from "./data-class-cases";
import { scoreDataClass, type DataClassResult } from "./data-class-score";

// AI-05: the data-class tagger against the real fast model, on the labelled set. Runs exactly what
// the tagger does (src/lib/messaging/tagger.ts): rules first; the model only when the rules found
// nothing sensitive; the stricter class wins; an unusable answer leaves the message C3.
//
//   npm run eval     (with the agent eval; needs AI_EVALS_GROQ_API_KEY)
//
// Writes evals-data-class.json and fails below the bar: every C3 message tagged C3, and ≥ 95%
// precision on C1 and C3. Made-up messages: not guest data.

for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

it(
  "data-class tagger: no sensitive message missed, ≥ 95% precision on C1 and C3",
  async () => {
    const ai = createModelClient("evals");
    const results: DataClassResult[] = [];

    for (const c of DATA_CLASS_CASES) {
      const rules = applyRules(c.text, c.names ?? []);
      const byRules = classFromRules(rules);
      let got: MessageClass;
      let source: DataClassResult["source"];
      if (byRules) {
        got = byRules;
        source = "rules";
      } else {
        const r = await classify(ai, { task: DATA_CLASS_TASK, labels: DATA_CLASS_LABELS, input: c.text, multi: true, fallback: DATA_CLASS_FALLBACK, guestData: false });
        got = r.fallback ? "C3" : combineClass(rules, r.labels);
        source = r.fallback ? "fallback" : "model";
      }
      results.push({ id: c.id, expected: c.cls, got, source });
    }

    const score = scoreDataClass(results);
    const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
    writeFileSync(
      "evals-data-class.json",
      JSON.stringify({ ranAt: new Date().toISOString(), model: modelFor("fast"), stub: process.env.AI_STUB === "1", score, wrong: results.filter((r) => r.got !== r.expected), results }, null, 2),
    );
    console.log(
      `Data class: ${score.correct}/${score.total} right. C3 precision ${pct(score.C3.precision)} recall ${pct(score.C3.recall)}; ` +
        `C1 precision ${pct(score.C1.precision)} recall ${pct(score.C1.recall)}. Sensitive missed: ${score.sensitiveMissed.length}. Report: evals-data-class.json`,
    );
    for (const r of results.filter((x) => x.got !== x.expected)) console.log(`  ${r.id}: expected ${r.expected}, got ${r.got} (${r.source})`);

    if (process.env.AI_STUB === "1") {
      expect(results).toHaveLength(DATA_CLASS_CASES.length);
      return;
    }
    expect(score.sensitiveMissed).toEqual([]);
    expect(score.meetsBar).toBe(true);
  },
  10 * 60_000,
);
