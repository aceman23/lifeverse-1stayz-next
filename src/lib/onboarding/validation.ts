import type { CheckStatus, OnboardingState, PolicyDetails, ServiceRow, StaffMember } from "./types";

const filled = (value: string) => value.trim().length > 0;

export function serviceTimeError(row: ServiceRow): string | null {
  if (row.startTime && row.endTime && row.startTime >= row.endTime) {
    return "End time must be after start time.";
  }
  return null;
}

/** The 10 national digits of a US/Canada number, or null if it isn't one. Formatting is ignored. */
function phoneDigits(value: string): string | null {
  if (/[^\d\s().+-]/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  // Area codes never start with 0 or 1.
  return /^[2-9]\d{9}$/.test(national) ? national : null;
}

/** "(970) 555-0177" -> "+19705550177" (what Twilio needs), or null if it isn't a US/Canada number. */
export function toE164(value: string): string | null {
  const d = phoneDigits(value.trim());
  return d ? `+1${d}` : null;
}

/** Optional field: blank is fine, anything else must be a US/Canada phone number. */
export function phoneError(value: string): string | null {
  const v = value.trim();
  if (!v || phoneDigits(v)) return null;
  return "Enter a 10-digit US phone number, like (555) 123-4567.";
}

/** "5551234567" or "+1 555.123.4567" -> "(555) 123-4567". Leaves anything invalid as typed. */
export function formatPhone(value: string): string {
  const d = phoneDigits(value.trim());
  return d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : value;
}

// Dot-separated labels ending in a real-looking TLD (letters, or punycode for non-Latin ones).
const HOSTNAME_RE = /^(?=.{1,253}$)(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+(?:[a-z]{2,63}|xn--[a-z\d-]{2,59})$/i;

/** Optional field: blank is fine, anything else must be a web address like gracecommunity.org. */
export function websiteError(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const message = "Enter a website like gracecommunity.org.";
  if (/\s/.test(v)) return message;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(v) ? v : `https://${v}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return message;
    return HOSTNAME_RE.test(url.hostname) ? null : message;
  } catch {
    return message;
  }
}

/** A public page on the church's own site: a full https:// address. Blank is "not yet". */
export function policyUrlError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Required";
  const message = "Enter the full address, starting with https://";
  if (/\s/.test(v) || !/^https:\/\//i.test(v)) return message;
  try {
    return HOSTNAME_RE.test(new URL(v).hostname) ? null : message;
  } catch {
    return message;
  }
}

/** "redemptionhills.com/sms" -> "https://redemptionhills.com/sms"; leaves anything else as typed. */
export function normalizePolicyUrl(value: string): string {
  const v = value.trim();
  return v && !/^[a-z][a-z\d+.-]*:\/\//i.test(v) ? `https://${v}` : v;
}

export function emailError(value: string): string | null {
  const v = value.trim();
  if (!v) return "Required";
  return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v) ? null : "Enter an email like hello@yourchurch.org.";
}

/** The church details the 1Stayz-hosted documents would be written with right now. */
export function currentPolicyDetails(s: OnboardingState): PolicyDetails {
  return {
    church_name: s.church.name.trim(),
    phone: s.church.phone.trim(),
    email: s.smsPolicy.contactEmail.trim().toLowerCase(),
    website: s.church.website.trim(),
    address: s.church.address.trim(),
  };
}

export type SmsPolicyState = "none" | "incomplete" | "approval_needed" | "outdated" | "done";

/** Where the SMS Terms and Privacy Policy stand. */
export function smsPolicyState(s: OnboardingState): SmsPolicyState {
  const p = s.smsPolicy;
  if (p.hosting === "church_site") {
    return !policyUrlError(p.termsUrl) && !policyUrlError(p.privacyUrl) ? "done" : "incomplete";
  }
  if (p.hosting === "1stayz") {
    if (!p.approvedAt || !p.approvedSnapshot) return emailError(p.contactEmail) ? "incomplete" : "approval_needed";
    const now = currentPolicyDetails(s);
    const then = p.approvedSnapshot;
    const same = (Object.keys(now) as (keyof PolicyDetails)[]).every((k) => now[k] === (then[k] ?? ""));
    return same ? "done" : "outdated";
  }
  return "none";
}

function serviceIsValid(row: ServiceRow) {
  return (
    filled(row.name) && filled(row.day) && filled(row.startTime) && filled(row.endTime) && !serviceTimeError(row)
  );
}

/**
 * Whether `step` (0-based) is filled in. Navigation isn't gated on this any more; it feeds the
 * Ready Check, and step 1 must be complete before anything can be saved.
 */
export function isStepComplete(step: number, s: OnboardingState): boolean {
  switch (step) {
    case 0:
      return (
        filled(s.church.name) &&
        filled(s.church.yourName) &&
        filled(s.church.yourRole) &&
        !phoneError(s.church.phone) &&
        !websiteError(s.church.website)
      );
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
  { key: "smsPolicy", label: "SMS Terms and Privacy Policy public", step: 3 },
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
    church: isStepComplete(0, s) ? "green" : churchFields.some(filled) ? "amber" : "gray",
    services: services.length === 0 ? "gray" : reviewed === services.length ? "green" : "amber",
    subsplash: int.subsplash !== "none" ? "green" : "gray",
    sms: int.smsStatus === "approved" || int.emailFallbackAcknowledged ? "green" : "amber",
    smsPolicy: { done: "green", none: "gray", incomplete: "amber", approval_needed: "amber", outdated: "amber" }[
      smsPolicyState(s)
    ] as CheckStatus,
    guardrails: s.guardrailsApprovedBy ? "green" : "gray",
    escalation:
      syncEscalationOrder(s.staff, s.escalationOrder).length > 0 ? "green" : s.staff.length > 0 ? "amber" : "gray",
    firstMessage:
      s.firstMessageStatus === "approved" ? "green" : s.firstMessageStatus === "awaiting" ? "amber" : "gray",
    consent: int.consentWordingLive ? "green" : "gray",
  };
}
