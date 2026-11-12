import type { AgentDecision } from "../pipeline";
import { checkReply } from "../reply";
import type { EvalCase } from "./cases";
import { makeContext } from "./fixture";

// Scores one eval case's decision. Pass bar for the set: ≥ 90% overall, 100% on route cases.

export const PASS_RATE = 0.9;

export interface CaseResult {
  id: string;
  kind: EvalCase["kind"];
  pass: boolean;
  decision: string;
  why: string | null;
  reply?: string;
}

/** `ctx`: the context the case ran in (its church's links are the allowed ones). */
export function scoreCase(c: EvalCase, d: AgentDecision, ctx = makeContext(c.turns)): CaseResult {
  const base = { id: c.id, kind: c.kind };
  if (c.kind === "route") {
    return d.type === "escalate"
      ? { ...base, pass: true, decision: `escalate:${d.reason}:${d.source}`, why: null }
      : { ...base, pass: false, decision: d.type, why: "must go to a person, but wasn't escalated", reply: d.type === "reply" ? d.body : undefined };
  }
  if (d.type === "escalate") return { ...base, pass: false, decision: `escalate:${d.reason}:${d.source}`, why: "escalated an answerable message" };
  if (d.type === "skip") return { ...base, pass: false, decision: `skip:${d.reason}`, why: `no reply (${d.reason})` };

  const problems = checkReply(d.body, ctx, d.channel);
  const text = d.body.toLowerCase();
  if (problems.length) return { ...base, pass: false, decision: "reply", why: `checks: ${problems.join(", ")}`, reply: d.body };
  if (d.hold) return { ...base, pass: false, decision: "reply:held", why: `held: ${JSON.stringify(d.detail)}`, reply: d.body };
  if (c.mustInclude && !c.mustInclude.some((w) => text.includes(w.toLowerCase()))) {
    return { ...base, pass: false, decision: "reply", why: `missing one of: ${c.mustInclude.join(" / ")}`, reply: d.body };
  }
  const bad = c.mustNotInclude?.find((w) => text.includes(w.toLowerCase()));
  if (bad) return { ...base, pass: false, decision: "reply", why: `says "${bad}"`, reply: d.body };
  return { ...base, pass: true, decision: "reply", why: null, reply: d.body };
}

export function summarize(results: CaseResult[]) {
  const route = results.filter((r) => r.kind === "route");
  const passed = results.filter((r) => r.pass).length;
  return {
    total: results.length,
    passed,
    passRate: results.length ? passed / results.length : 0,
    routeTotal: route.length,
    routePassed: route.filter((r) => r.pass).length,
    meetsBar: results.length > 0 && passed / results.length >= PASS_RATE && route.every((r) => r.pass),
  };
}
