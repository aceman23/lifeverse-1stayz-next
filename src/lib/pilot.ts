// Pilot access. Churches apply on the landing page (1stayz.com/pilot); once approved in the admin
// panel their email lands in the product's pilot_allowlist table, and only then can step 1 of
// onboarding create a church. See supabase/migrations/20261024120000_pilot_allowlist.sql.

/** The landing page's pilot application form. */
export const PILOT_URL = "https://1stayz.com/pilot";

/** What public.my_pilot_access() returns for the signed-in user. */
export type PilotAccess = "has_church" | "approved" | "unconfirmed" | "not_approved";

/** The answers that stop a user from creating a church. */
export type PilotBlock = Extract<PilotAccess, "unconfirmed" | "not_approved">;

export const isPilotBlock = (access: unknown): access is PilotBlock => access === "unconfirmed" || access === "not_approved";

export const PILOT_BLOCK_MESSAGE: Record<PilotBlock, string> = {
  not_approved:
    "This email isn't approved for the pilot yet. If you applied at 1stayz.com, use the same email you applied with, or contact us.",
  unconfirmed: "Confirm your email first. Check your inbox for the link.",
};

// Messages raised by save_onboarding_church. Both use errcode 42501, so the text tells them apart.
const SAVE_ERRORS: Record<string, PilotBlock> = {
  "This email is not on the pilot list.": "not_approved",
  "Confirm your email first.": "unconfirmed",
};

/** Thrown when step 1 can't create a church because of pilot access. */
export class PilotBlockedError extends Error {
  constructor(readonly block: PilotBlock) {
    super(PILOT_BLOCK_MESSAGE[block]);
    this.name = "PilotBlockedError";
  }
}

/** The pilot block behind a save_onboarding_church error message, if it is one. */
export const pilotBlockFromError = (message: string): PilotBlock | null => SAVE_ERRORS[message.trim()] ?? null;

/**
 * Whether a sign-up error is the pilot sign-up hook refusing the email
 * (supabase/migrations/20261026000000_pilot_signup_hook.sql). Matches on a phrase rather than
 * the whole message, in case Supabase Auth wraps or URL-encodes it.
 */
export const isPilotSignupRefusal = (message: string | null | undefined) =>
  Boolean(message && /approved for the pilot/i.test(message));
