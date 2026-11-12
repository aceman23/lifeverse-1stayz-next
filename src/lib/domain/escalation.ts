export const ESCALATION_REASONS = ["care", "crisis", "theology", "meet_pastor", "other"] as const;
export type EscalationReason = (typeof ESCALATION_REASONS)[number];

export const ESCALATION_REASON_LABEL: Record<string, string> = {
  care: "Care or prayer",
  crisis: "Crisis or safety",
  theology: "Theology question",
  meet_pastor: "Wants to meet a pastor",
  other: "Needs a person",
};

/** Escalations should get a human reply within this window (SOW S5). */
export const ESCALATION_SLA_MIN = 15;
