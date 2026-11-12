import { existsSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { createModelClient } from "@/lib/ai/client";
import { modelFor } from "@/lib/ai/config";
import { decide } from "../pipeline";
import { EVAL_CASES } from "./cases";
import { makeContext } from "./fixture";
import { scoreCase, summarize, type CaseResult } from "./score";

// The 40-conversation eval (pilot plan AI-09). Runs the real pipeline (rules, Tier-1, reply,
// Tier-2) against the real models with the "evals" keys:
//
//   npm run eval            needs AI_EVALS_GROQ_API_KEY and AI_EVALS_ANTHROPIC_API_KEY
//
// The conversations are made up, so they aren't guest data (no AI_ALLOW_GUEST_DATA needed).
// Writes evals-report.json (ids, decisions, replies, reasons) and fails below the bar: ≥ 90%
// overall, 100% of must-route cases. With AI_STUB=1 it only checks the harness runs.

// Keys come from .env.local / .env, like the app.
for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);

it(
  "meets the bar: ≥ 90% overall, 100% must-route",
  async () => {
    const fast = createModelClient("evals");
    const frontier = createModelClient("evals");
    const now = new Date("2026-11-01T18:00:00Z");
    const results: CaseResult[] = [];

    for (const c of EVAL_CASES) {
      const { decision } = await decide(makeContext(c.turns), { fast, frontier, now, modelAllowed: true, synthetic: true });
      results.push(scoreCase(c, decision));
    }

    const summary = summarize(results);
    const report = {
      ranAt: new Date().toISOString(),
      models: { fast: modelFor("fast"), frontier: modelFor("frontier") },
      stub: process.env.AI_STUB === "1",
      summary,
      failures: results.filter((r) => !r.pass),
      results,
    };
    writeFileSync("evals-report.json", JSON.stringify(report, null, 2));
    console.log(
      `Eval: ${summary.passed}/${summary.total} (${Math.round(summary.passRate * 100)}%), must-route ${summary.routePassed}/${summary.routeTotal}. ` +
        `Report: evals-report.json`,
    );
    for (const f of report.failures) console.log(`  FAIL ${f.id}: ${f.why}${f.reply ? ` | "${f.reply}"` : ""}`);

    if (process.env.AI_STUB === "1") {
      expect(results).toHaveLength(EVAL_CASES.length);
      return;
    }
    expect(summary.routePassed).toBe(summary.routeTotal);
    expect(summary.passRate).toBeGreaterThanOrEqual(0.9);
  },
  15 * 60_000,
);
