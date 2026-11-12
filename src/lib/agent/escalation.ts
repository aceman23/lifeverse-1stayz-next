import { SENSITIVE } from "@/lib/ai/data-class";
import type { ClassifyLabel } from "@/lib/ai/classify";
import type { EscalationReason } from "@/lib/domain/escalation";
import type { AgentContext } from "./context";

// Escalation classifier (AI-07). Three chances to send a guest to a person, cheapest first:
//   1. rules: crisis words, care topics, asking for a pastor, complaints, minors. No model needed,
//      so they work even before AI-02 is confirmed.
//   2. Tier-1 (fast model): crisis / care / theology / meet a pastor / other / none, with the
//      church's own "always send to a person" topics. An unclear answer escalates.
//   3. Tier-2 (frontier model) reviews the guest message with the drafted reply (tier2.ts).
// False alarms cost a staff member a minute; a miss can cost much more. So every step leans
// toward a person.

const RULE_REASON: Record<string, EscalationReason> = {
  crisis: "crisis",
  abuse: "crisis",
  prayer: "care",
  grief: "care",
  health: "care",
  mental_health: "care",
  addiction: "care",
  family_conflict: "care",
  hardship: "care",
  hard_season: "care",
};

// Someone asking how to become a Christian goes to a pastor. (Baptism isn't here: churches decide
// in their guardrails whether the assistant may explain it.)
const SALVATION = /\b(get saved|be saved|accept(ed)? (jesus|christ)|salvation|become a christian|give my life to|forgive(n|ness) for my|my sins?)\b/i;

const MEET_PASTOR = /\b(talk|speak|meet|chat|sit down)\s+(to|with)\s+(a|the|your|someone|somebody|an?\s+actual)?\s*(pastor|minister|priest|real person|person|human|someone|somebody)\b|\bpastor('s)?\s+(number|phone|email|contact)\b|\bcall me\b/i;
const COMPLAINT = /\b(complain\w*|upset|offended|disappointed|rude|unwelcome|angry|furious|never coming back)\b/i;
// The guest says they're under 18 ("I'm 15", "I am 16 years old", "I'm 14 and..."). A parent
// mentioning a child's age doesn't count.
const MINOR = /\b(i'?m|i am)\s+(1[0-7])(\s*(years?|yrs?)\s*old|\s+and\b|\s*[.!,?]|\s*$)|\b(i'?m|i am) in (6|7|8|9|10|11)th grade\b|\bmy (mom|dad|parents) (said|won'?t let|don'?t know)\b/i;

export interface RuleEscalation {
  reason: EscalationReason;
  rules: string[];
}

/** The rules' verdict, or null if no rule fires. Crisis wins over everything else. */
export function escalationFromRules(text: string): RuleEscalation | null {
  const hits = SENSITIVE.filter((r) => r.id !== "faith_journey" && r.pattern.test(text)).map((r) => r.id);
  if (SALVATION.test(text)) hits.push("salvation");
  if (MEET_PASTOR.test(text)) hits.push("meet_pastor");
  if (COMPLAINT.test(text)) hits.push("complaint");
  if (MINOR.test(text)) hits.push("minor");
  if (hits.length === 0) return null;

  const reasons = hits.map((h) => RULE_REASON[h] ?? (h === "meet_pastor" ? "meet_pastor" : h === "salvation" ? "theology" : "other"));
  const order: EscalationReason[] = ["crisis", "care", "meet_pastor", "theology", "other"];
  const reason = order.find((r) => reasons.includes(r)) ?? "other";
  return { reason, rules: hits };
}

export type EscalationLabel = "crisis" | "care" | "theology" | "meet_pastor" | "other" | "none";

export const ESCALATION_LABELS: readonly ClassifyLabel<EscalationLabel>[] = [
  { id: "crisis", description: "any hint of danger: self-harm, suicide, abuse, violence, a medical emergency, someone not safe" },
  {
    id: "care",
    description: "a prayer request, grief or loss, illness, a hard season, family or marriage trouble, addiction, money hardship, loneliness",
  },
  {
    id: "theology",
    description: "a question about what the church believes or about faith, salvation, baptism, the Bible, or a doctrinal position",
  },
  { id: "meet_pastor", description: "wants to talk to, meet or be called by a pastor or a real person" },
  { id: "other", description: "a complaint, a child or teen writing, a legal or safety issue, or anything a person should handle" },
  { id: "none", description: "an everyday question or reply the assistant can answer: times, parking, kids' programs, groups, thanks" },
];

/** Unclear model answer: send it to a person. */
export const ESCALATION_FALLBACK: readonly EscalationLabel[] = ["care"];

export function escalationTask(ctx: AgentContext): string {
  const topics = ctx.guardrails.config?.escalation_topics ?? [];
  const routed = (ctx.guardrails.config?.positions ?? []).filter((p) => p.stance !== "explain").map((p) => p.topic);
  return [
    `You help the welcome team at ${ctx.church.name}, a church. A guest texted the church. Decide whether a person on the team must answer instead of the church's text assistant.`,
    topics.length ? `This church always sends these topics to a person: ${topics.join("; ")}.` : "",
    routed.length ? `The assistant must not discuss these topics; questions about them go to a pastor (theology): ${routed.join("; ")}.` : "",
    "When in doubt, choose a label other than none.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Maps a Tier-1 label to an escalation reason (null = the assistant may answer). */
export function reasonOf(label: EscalationLabel): EscalationReason | null {
  return label === "none" ? null : label;
}
