import { STOP_PHRASE, TIMEZONES } from "@/lib/onboarding/constants";
import { formatPhone, phoneError, websiteError } from "@/lib/onboarding/validation";
import type { ChurchProfileValues } from "./types";

/** Longest approved wording for an "Explain" topic (church_doctrinal_positions.wording). */
export const WORDING_MAX = 10000;

// Shared by the Settings form (instant feedback) and the server actions (the real check).
// Limits match the column checks in supabase/migrations.

export type ProfileErrors = Partial<Record<keyof ChurchProfileValues, string>>;

/** IANA zones the app offers, e.g. "America/Chicago". */
export const TIMEZONE_OPTIONS = TIMEZONES.map((label) => {
  const [zone, abbr] = label.split(" ");
  return { zone, label: `${zone.split("/")[1].replaceAll("_", " ")} ${abbr}` };
});

export const MAX_ATTENDANCE = 100_000;
export const MAX_FIRST_MESSAGE = 2000;

export interface ParsedProfile {
  name: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  timezone: string;
  denomination: string | null;
  averageAttendance: number | null;
}

/** Checks the form; returns field errors, or the cleaned values ready to save. */
export function parseProfile(v: ChurchProfileValues): { errors: ProfileErrors } | { values: ParsedProfile } {
  const errors: ProfileErrors = {};
  const name = v.name.trim();
  const address = v.address.trim();
  const denomination = v.denomination.trim();
  const attendance = v.averageAttendance.trim();

  if (!name) errors.name = "Enter your church's name.";
  else if (name.length > 200) errors.name = "Keep the name to 200 characters or fewer.";

  const phone = phoneError(v.phone);
  if (phone) errors.phone = phone;

  const website = websiteError(v.website);
  if (website) errors.website = website;
  else if (v.website.trim().length > 500) errors.website = "Keep the website to 500 characters or fewer.";

  if (address.length > 500) errors.address = "Keep the address to 500 characters or fewer.";
  if (denomination.length > 100) errors.denomination = "Keep this to 100 characters or fewer.";

  // Existing churches may have a zone outside the list (set before the list changed); keep it.
  if (!/^[A-Za-z_]+\/[A-Za-z_]+$/.test(v.timezone)) errors.timezone = "Choose a time zone.";

  let averageAttendance: number | null = null;
  if (attendance) {
    const n = Number(attendance);
    if (!/^\d+$/.test(attendance) || n > MAX_ATTENDANCE) {
      errors.averageAttendance = `Enter a whole number from 0 to ${MAX_ATTENDANCE.toLocaleString()}.`;
    } else {
      averageAttendance = n;
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    values: {
      name,
      phone: v.phone.trim() ? formatPhone(v.phone.trim()) : null,
      website: v.website.trim() || null,
      address: address || null,
      timezone: v.timezone,
      denomination: denomination || null,
      averageAttendance,
    },
  };
}

export function firstMessageError(body: string): string | null {
  const text = body.trim();
  if (!text) return "The first message can't be empty.";
  if (text.length > MAX_FIRST_MESSAGE) return `Keep the message to ${MAX_FIRST_MESSAGE.toLocaleString()} characters or fewer.`;
  if (!text.includes(STOP_PHRASE)) return `The message must include “${STOP_PHRASE}”.`;
  return null;
}

// ---------------------------------------------------------------------------
// Settings › Guardrails and Team & Escalations (UI-08)
// ---------------------------------------------------------------------------
export interface GuardrailsInput {
  tone: string[];
  signOff: string;
  positions: { id: string; topic: string; stance: "explain" | "route" | "skip"; wording: string }[];
  escalationTopics: { id: string; label: string; enabled: boolean }[];
}

/** The first problem with the guardrails as entered, or null. Same rules as the database. */
export function guardrailsError(g: GuardrailsInput): string | null {
  if (g.positions.length > 50 || g.escalationTopics.length > 50) return "Up to 50 topics each.";
  for (const p of g.positions) {
    if (!p.topic.trim()) return "Give every belief or practice a name.";
    if (p.topic.trim().length > 200) return `"${p.topic.trim().slice(0, 40)}…" is too long a name.`;
    if (p.stance === "explain" && !p.wording.trim()) return `Add your approved wording for ${p.topic.trim()}, or choose another option.`;
    if (p.wording.length > WORDING_MAX) return `The wording for ${p.topic.trim()} is too long (${p.wording.length.toLocaleString()} of ${WORDING_MAX.toLocaleString()} characters).`;
  }
  const names = g.positions.map((p) => p.topic.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Each belief or practice can only be listed once.";
  for (const t of g.escalationTopics) {
    if (!t.label.trim()) return "Give every escalation topic a name.";
    if (t.label.trim().length > 200) return "An escalation topic name is too long.";
  }
  if (g.signOff.length > 200) return "The sign-off is too long.";
  return null;
}

export interface TeamInput {
  staff: {
    id: string;
    name: string;
    role: string;
    mobile: string;
    email: string;
    receivesEscalations: boolean;
    receivesCare: boolean;
    receivesGeneral: boolean;
  }[];
  /** Ids of staff who receive escalations, first contacted first. */
  escalationOrder: string[];
  quietHours: { start: string; end: string } | null;
  staffAlerts: { enabled: boolean; phone: string; consent: boolean };
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;
const PHONE_RE = /^\D*1?\D*[2-9]\d{2}\D*\d{3}\D*\d{4}\D*$/;
const CLOCK_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Problems keyed by staff id (or "alerts" / "quietHours" / "team"), so the form can show them in place. */
export function teamErrors(t: TeamInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (t.staff.length === 0) errors.team = "Add at least one person.";
  if (t.staff.length > 50) errors.team = "Up to 50 people.";
  for (const m of t.staff) {
    if (!m.name.trim()) errors[m.id] = "Add a name.";
    else if (m.email.trim() && !EMAIL_RE.test(m.email.trim())) errors[m.id] = "Check the email address.";
    else if (m.mobile.trim() && !PHONE_RE.test(m.mobile.trim())) errors[m.id] = "Check the mobile number.";
    else if (m.receivesEscalations && !m.email.trim()) errors[m.id] = "Escalation contacts need an email, so the alert reaches them.";
  }
  if (!errors.team && !t.staff.some((m) => m.receivesEscalations)) errors.team = "At least one person needs to receive escalations.";
  if (t.staffAlerts.enabled) {
    if (!t.staffAlerts.phone.trim() || !PHONE_RE.test(t.staffAlerts.phone.trim())) errors.alerts = "Enter the US mobile number that gets the alert texts.";
    else if (!t.staffAlerts.consent) errors.alerts = "Confirm the number's owner agreed to get alert texts.";
  }
  if (t.quietHours && (!CLOCK_RE.test(t.quietHours.start) || !CLOCK_RE.test(t.quietHours.end) || t.quietHours.start === t.quietHours.end)) {
    errors.quietHours = "Choose a start and an end time.";
  }
  return errors;
}
