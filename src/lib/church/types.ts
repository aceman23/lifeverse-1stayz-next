import type { GuardrailChange } from "./guardrail-diff";
import type {
  DoctrinalStance,
  EmailProvider,
  FirstMessageStatus,
  SmsStatus,
  SubsplashMethod,
} from "@/lib/onboarding/types";

// The signed-in church's settings, as the Settings page shows them. Read on the server from
// the onboarding tables (src/lib/church/server.ts); the demo uses src/data/settings-demo.ts.

/** Modes a church can be in once setup is finished. "setup" only exists before step 8. */
export type ChurchMode = "shadow" | "live";

export interface ChurchProfileValues {
  name: string;
  phone: string;
  website: string;
  address: string;
  /** IANA zone, e.g. "America/Chicago". */
  timezone: string;
  denomination: string;
  /** Blank, or a whole number as typed. Kept as a string so the input can be empty. */
  averageAttendance: string;
}

export interface ChurchService {
  id: string;
  name: string;
  day: string;
  /** "09:00", or "" if not set. */
  startTime: string;
  endTime: string;
}

export interface ChurchGuardrails {
  tone: string[];
  signOff: string;
  /** wording: the church's approved words, used when the stance is "explain". */
  positions: { id: string; topic: string; stance: DoctrinalStance; wording: string }[];
  escalationTopics: { id: string; label: string; enabled: boolean }[];
  approvedBy: string | null;
  approvedAt: string | null;
}

export interface ChurchStaffMember {
  id: string;
  name: string;
  role: string;
  mobile: string;
  email: string;
  receivesEscalations: boolean;
  receivesCare: boolean;
  receivesGeneral: boolean;
  /** 1 = contacted first when someone needs a pastor; null = not in the escalation order. */
  escalationRank: number | null;
}

/** The Tier-2 model's review of a first message's wording (AI-07). Advice for the pastor. */
export interface FirstMessageReview {
  verdict: "pass" | "concerns" | "unavailable";
  /** What it flagged (see REVIEW_LABEL_TEXT). */
  labels: string[];
  model: string | null;
  reviewedAt: string;
}

export interface ChurchFirstMessage {
  templateName: string;
  body: string;
  status: FirstMessageStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  /** The review of the current wording, or null if there's none yet. */
  review?: FirstMessageReview | null;
}

/** An optional first-message family (AI-07): null until the owner writes one. */
export interface ChurchFirstMessageFamily {
  body: string;
  status: "awaiting" | "approved";
  approvedBy: string | null;
  approvedAt: string | null;
  review: FirstMessageReview | null;
}

export interface ChurchIntegrations {
  subsplash: SubsplashMethod;
  emailProvider: EmailProvider;
  smsStatus: SmsStatus;
  emailFallbackAcknowledged: boolean;
  consentWordingLive: boolean;
}

export interface IntakeKey {
  id: string;
  label: string;
  /** "isk_1a2b3c4d": enough to tell keys apart; the full key is only shown once. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ChurchSettings {
  /** Demo data: nothing is read from or saved to Supabase. */
  demo: boolean;
  /** The signed-in user owns the church (may manage intake keys). */
  isOwner: boolean;
  intakeKeys: IntakeKey[];
  profile: ChurchProfileValues;
  services: ChurchService[];
  guardrails: ChurchGuardrails;
  staff: ChurchStaffMember[];
  quietHours: { start: string; end: string } | null;
  /** Texts to the team when someone needs a pastor (WP-8). Phone as typed. */
  staffAlerts: { enabled: boolean; phone: string; consent: boolean };
  /** Null until onboarding step 7 is saved. */
  firstMessage: ChurchFirstMessage | null;
  /** The optional families: kids and returning guests (AI-07). */
  firstMessageFamilies: { family: ChurchFirstMessageFamily | null; returning: ChurchFirstMessageFamily | null };
  /** Approved guardrail versions, newest first, with what changed in each (AI-06). */
  guardrailHistory: GuardrailHistoryEntry[];
  /** What the church allows beyond its own use of its data (restrictive by default; AI-06). */
  learningConsent: LearningConsent;
  /** Null until onboarding step 4 is saved. */
  integrations: ChurchIntegrations | null;
  /** For the {kids_ministry} variable in the first message preview. */
  ministries: string[];
  mode: ChurchMode;
}

/** What the app shell needs on every page: the mode pill and whether Live can be chosen. */
export interface WorkspaceSummary {
  demo: boolean;
  mode: ChurchMode;
  /** Why Live can't be chosen right now, or null if it can. */
  liveBlockedReason: string | null;
  /** Things waiting for staff (escalations, identity reviews, drafts, alerts): the Today badge. */
  actionCount: number;
  /** Who's signed in, for the account menu. Null in the demo (it shows the sample user). */
  user: { name: string; email: string | null } | null;
  /** The church's name, for the sidebar's account card. */
  churchName: string | null;
}

/** Result of a server action: ok, or a message to show the user. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export interface GuardrailHistoryEntry {
  version: number;
  approvedBy: string | null;
  approvedAt: string;
  /** The church's first approved version (nothing before it to compare with). */
  first: boolean;
  changes: GuardrailChange[];
}

export interface LearningConsent {
  inTenantOnly: boolean;
  contributePatterns: boolean;
  contributeAggregates: boolean;
  shareDenominationFamily: boolean;
  /** Always false during the pilot. */
  trainingAuthorized: boolean;
  kMinimum: number;
  addendumSignedAt: string | null;
}
