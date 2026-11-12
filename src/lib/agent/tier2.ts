import type { ClassifyLabel } from "@/lib/ai/classify";
import type { EscalationReason } from "@/lib/domain/escalation";
import type { AgentContext } from "./context";

// Tier-2 gate (AI-08): the frontier model reads the guest's message and the drafted reply
// before anything can go out. It can pass the draft, send the conversation to a person, or block
// the draft (which is then only held for staff). An unclear answer blocks.

export type Tier2Label =
  | "pass"
  | "escalate_crisis"
  | "escalate_care"
  | "escalate_theology"
  | "escalate_meet_pastor"
  | "escalate_other"
  | "block";

export const TIER2_LABELS: readonly ClassifyLabel<Tier2Label>[] = [
  { id: "pass", description: "the reply is accurate, kind, follows every rule, and the guest's message is fine for the assistant to answer" },
  { id: "escalate_crisis", description: "the guest may be in danger or crisis (self-harm, abuse, violence, emergency)" },
  { id: "escalate_care", description: "the guest shared a care need, grief, illness, prayer request or hard season: a person should answer" },
  { id: "escalate_theology", description: "the guest asked about beliefs or doctrine the church routes to a pastor" },
  { id: "escalate_meet_pastor", description: "the guest wants a pastor or a real person" },
  { id: "escalate_other", description: "a complaint, a minor, or anything else a person should handle" },
  {
    id: "block",
    description:
      "the reply breaks a rule: invents facts, gives advice, more than one question, claims to be human, contradicts the church's positions, or is unkind",
  },
];

export const TIER2_FALLBACK: readonly Tier2Label[] = ["block"];

export function tier2Task(ctx: AgentContext, rules: string): string {
  return [
    `You review a text reply that ${ctx.church.name}'s assistant drafted for a guest, before it is sent. Be strict: when unsure, do not pass.`,
    "The assistant's rules and the church facts it may use:",
    rules,
  ].join("\n\n");
}

/** What goes inside <text>: the guest's latest messages and the draft. */
export function tier2Input(guestText: string, draft: string): string {
  return `GUEST WROTE:\n${guestText}\n\nDRAFTED REPLY:\n${draft}`;
}

export function tier2Decision(label: Tier2Label): { decision: "pass" | "escalate" | "block"; reason: EscalationReason | null } {
  if (label === "pass") return { decision: "pass", reason: null };
  if (label === "block") return { decision: "block", reason: null };
  return { decision: "escalate", reason: label.replace("escalate_", "") as EscalationReason };
}
