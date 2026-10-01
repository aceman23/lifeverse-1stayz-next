import type { CheckStatus, OnboardingState, ServiceRow, StaffMember } from "./types";

const filled = (value: string) => value.trim().length > 0;

export function serviceTimeError(row: ServiceRow): string | null {
  if (row.startTime && row.endTime && row.startTime >= row.endTime) {
    return "End time must be after start time.";
  }
  return null;
}

function serviceIsValid(row: ServiceRow) {
  return (
    filled(row.name) && filled(row.day) && filled(row.startTime) && filled(row.endTime) && !serviceTimeError(row)
  );
}

/** Whether the Continue button is enabled on `step` (0-based). */
export function canContinue(step: number, s: OnboardingState): boolean {
  switch (step) {
    case 0:
      return filled(s.church.name) && filled(s.church.yourName) && filled(s.church.yourRole);
    case 1:
      return s.serviceSchedule.length > 0 && s.serviceSchedule.every(serviceIsValid);
    case 2:
      return s.needs.length > 0 || filled(s.otherNeed);
    case 3:
      return true;
    case 4:
      return s.guardrailsApprovedBy !== null;
    case 5:
      return (
        s.staff.length > 0 &&
        s.staff.some((m) => m.receivesEscalations) &&
        (!s.staffAlertsEnabled || s.staffAlertsConsent)
      );
    case 6:
      return s.firstMessageStatus === "approved";
    default:
      return false;
  }
}

/** A step can be opened from the progress bar once every step before it is complete. */
export function canGoToStep(target: number, s: OnboardingState): boolean {
  for (let i = 0; i < target; i++) {
    if (!canContinue(i, s)) return false;
  }
  return true;
}

/** Ids of staff who receive escalations, in escalation order. Fixes up a stale or partial order. */
export function syncEscalationOrder(staff: StaffMember[], order: string[]): string[] {
  const eligible = staff.filter((m) => m.receivesEscalations).map((m) => m.id);
  const kept = order.filter((id) => eligible.includes(id));
  return [...kept, ...eligible.filter((id) => !kept.includes(id))];
}

export interface ReadyItem {
  key: string;
  label: string;
  step: number;
}

export const READY_ITEMS: ReadyItem[] = [
  { key: "church", label: "Church profile reviewed", step: 0 },
  { key: "services", label: "Service schedule reviewed", step: 1 },
  { key: "subsplash", label: "Subsplash connected", step: 3 },
  { key: "sms", label: "Text number approved OR email-first fallback acknowledged", step: 3 },
  { key: "guardrails", label: "Guardrails approved by pastor", step: 4 },
  { key: "escalation", label: "Escalation contact set", step: 5 },
  { key: "firstMessage", label: "First message approved by pastor", step: 6 },
  { key: "consent", label: "Consent wording live on connection card", step: 6 },
];

export function computeReadyCheck(s: OnboardingState): Record<string, CheckStatus> {
  const { church, serviceSchedule: services, integrations: int } = s;
  const churchFields = [church.name, church.yourName, church.yourRole];
  const reviewed = services.filter((r) => r.reviewed && serviceIsValid(r)).length;

  return {
    church: churchFields.every(filled) ? "green" : churchFields.some(filled) ? "amber" : "gray",
    services: services.length === 0 ? "gray" : reviewed === services.length ? "green" : "amber",
    subsplash: int.subsplash !== "none" ? "green" : "gray",
    sms: int.smsStatus === "approved" || int.emailFallbackAcknowledged ? "green" : "amber",
    guardrails: s.guardrailsApprovedBy ? "green" : "gray",
    escalation:
      syncEscalationOrder(s.staff, s.escalationOrder).length > 0 ? "green" : s.staff.length > 0 ? "amber" : "gray",
    firstMessage:
      s.firstMessageStatus === "approved" ? "green" : s.firstMessageStatus === "awaiting" ? "amber" : "gray",
    consent: int.consentWordingLive ? "green" : "gray",
  };
}
