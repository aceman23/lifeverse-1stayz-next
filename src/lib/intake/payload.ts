// Shape checks for POST /api/intake. The database function intake_guest() does the real
// work (normalizing, matching, deadlines); this rejects malformed requests early with a
// field-by-field error the sender (Zapier, Make, Subsplash) can act on.

export const INTAKE_SOURCES = ["subsplash", "connect_card", "website", "text_in"] as const;
export type IntakeSource = (typeof INTAKE_SOURCES)[number];

export interface IntakePayload {
  source: IntakeSource;
  submission_id: string;
  submitted_at?: string;
  attended_at?: string;
  service?: string;
  first_name: string;
  last_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  sms_consent?: boolean;
  email_consent?: boolean;
  consent_wording?: string;
  interests?: string[];
  household?: { name: string; relation?: string; age?: number }[];
  prayer_request?: string;
}

export const MAX_BODY_BYTES = 32_000;

type Errors = Record<string, string>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function optionalString(body: Record<string, unknown>, key: string, max: number, errors: Errors): string | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string" && typeof v !== "number") {
    errors[key] = "must be a string";
    return undefined;
  }
  const s = String(v).trim();
  if (s.length > max) errors[key] = `must be ${max} characters or fewer`;
  return s || undefined;
}

function optionalBoolean(body: Record<string, unknown>, key: string, errors: Errors): boolean | undefined {
  const v = body[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "boolean") return v;
  // Zapier and Make often send form checkboxes as text.
  if (typeof v === "string" && /^(true|yes|1|on|checked)$/i.test(v.trim())) return true;
  if (typeof v === "string" && /^(false|no|0|off|unchecked)$/i.test(v.trim())) return false;
  errors[key] = "must be true or false";
  return undefined;
}

function optionalDate(body: Record<string, unknown>, key: string, errors: Errors): string | undefined {
  const s = optionalString(body, key, 40, errors);
  if (s !== undefined && Number.isNaN(Date.parse(s))) errors[key] = "must be an ISO 8601 date and time";
  return s;
}

/** Validates the request body. Returns the cleaned payload, or field errors. */
export function parseIntakePayload(body: unknown): { payload: IntakePayload } | { errors: Errors } {
  if (!isObject(body)) return { errors: { body: "must be a JSON object" } };
  const errors: Errors = {};

  const source = body.source;
  if (typeof source !== "string" || !INTAKE_SOURCES.includes(source as IntakeSource)) {
    errors.source = `must be one of ${INTAKE_SOURCES.join(", ")}`;
  }
  const submissionId = optionalString(body, "submission_id", 200, errors);
  if (!submissionId) errors.submission_id ??= "is required: the form's own id for this submission";
  const firstName = optionalString(body, "first_name", 100, errors);
  if (!firstName) errors.first_name ??= "is required";

  let interests: string[] | undefined;
  if (body.interests !== undefined && body.interests !== null) {
    if (typeof body.interests === "string") {
      interests = body.interests.split(",").map((s) => s.trim()).filter(Boolean);
    } else if (Array.isArray(body.interests) && body.interests.every((i) => typeof i === "string")) {
      interests = (body.interests as string[]).map((s) => s.trim()).filter(Boolean);
    } else {
      errors.interests = "must be a list of strings (or a comma-separated string)";
    }
    if (interests && (interests.length > 30 || interests.some((i) => i.length > 100))) {
      errors.interests = "at most 30 items of 100 characters";
    }
  }

  let household: IntakePayload["household"];
  if (body.household !== undefined && body.household !== null) {
    if (!Array.isArray(body.household) || body.household.length > 10 || !body.household.every(isObject)) {
      errors.household = "must be a list of up to 10 { name, relation, age } objects";
    } else {
      household = body.household.map((m) => ({
        name: String(m.name ?? "").trim().slice(0, 100),
        relation: typeof m.relation === "string" ? m.relation.trim().toLowerCase() : undefined,
        age: typeof m.age === "number" || (typeof m.age === "string" && /^\d{1,3}$/.test(m.age)) ? Number(m.age) : undefined,
      }));
    }
  }

  const payload: IntakePayload = {
    source: source as IntakeSource,
    submission_id: submissionId ?? "",
    submitted_at: optionalDate(body, "submitted_at", errors),
    attended_at: optionalDate(body, "attended_at", errors),
    service: optionalString(body, "service", 200, errors),
    first_name: firstName ?? "",
    last_name: optionalString(body, "last_name", 100, errors),
    email: optionalString(body, "email", 320, errors),
    phone: optionalString(body, "phone", 40, errors),
    city: optionalString(body, "city", 100, errors),
    sms_consent: optionalBoolean(body, "sms_consent", errors),
    email_consent: optionalBoolean(body, "email_consent", errors),
    consent_wording: optionalString(body, "consent_wording", 2000, errors),
    interests,
    household,
    prayer_request: optionalString(body, "prayer_request", 2000, errors),
  };

  return Object.keys(errors).length > 0 ? { errors } : { payload };
}

/** "Bearer isk_…" (or an X-Intake-Key header) -> the key, if it has the right shape. */
export function readIntakeKey(authorization: string | null, header: string | null): string | null {
  const raw = header ?? authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const key = raw.trim();
  return /^isk_[0-9a-f]{64}$/.test(key) ? key : null;
}
