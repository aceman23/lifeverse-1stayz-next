import type { PolicyDetails } from "@/lib/sms-policy/templates";

export interface ChurchProfile {
  name: string;
  website: string;
  address: string;
  timezone: string;
  phone: string;
  yourName: string;
  yourRole: string;
}

export interface ServiceRow {
  id: string;
  name: string;
  day: string;
  startTime: string;
  endTime: string;
  reviewed: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  mobile: string;
  email: string;
  receivesEscalations: boolean;
  receivesCare: boolean;
  receivesGeneral: boolean;
}

export type DoctrinalStance = "explain" | "route" | "skip";

export interface DoctrinalPosition {
  id: string;
  topic: string;
  stance: DoctrinalStance;
  wording: string;
}

export interface EscalationTopic {
  id: string;
  label: string;
  enabled: boolean;
}

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}

export interface UploadedDocument {
  id: string;
  name: string;
  type: string;
}

export type SubsplashMethod = "none" | "webhook" | "zapier" | "qrcard";
export type EmailProvider = "none" | "gmail" | "outlook" | "1stayz";
export type SmsStatus = "submitted" | "pending" | "approved";
export type FirstMessageStatus = "draft" | "awaiting" | "approved";
export type CheckStatus = "green" | "amber" | "gray";

export type SmsPolicyHosting = "church_site" | "1stayz";

/** The church's public SMS Terms and Privacy Policy (carriers require both for 10DLC). */
export interface SmsPolicy {
  hosting: SmsPolicyHosting | null;
  /** church_site: the church's own public pages. */
  termsUrl: string;
  privacyUrl: string;
  /** 1stayz: where guests reach the church about texts. */
  contactEmail: string;
  /** 1stayz: set on first approval, then fixed (the URLs are registered with carriers). */
  slug: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  templateVersion: number | null;
  /** The church details the approved documents were written with. */
  approvedSnapshot: PolicyDetails | null;
}

export interface Integrations {
  subsplash: SubsplashMethod;
  email: EmailProvider;
  smsStatus: SmsStatus;
  emailFallbackAcknowledged: boolean;
  consentWordingLive: boolean;
  shadowSundayAcknowledged: boolean;
  shadowSundayCompleted: boolean;
}

export interface OnboardingState {
  currentStep: number;
  completed: boolean;

  church: ChurchProfile;

  /** True once the fake website scan in step 2 has filled in the drafts. */
  siteScanned: boolean;
  serviceSchedule: ServiceRow[];
  ministries: string[];
  guestFields: string[];

  needs: string[];
  otherNeed: string;

  integrations: Integrations;
  smsPolicy: SmsPolicy;

  documents: UploadedDocument[];
  doctrinalPositions: DoctrinalPosition[];
  escalationTopics: EscalationTopic[];
  tone: string[];
  signOff: string;
  guardrailsApprovedBy: string | null;
  guardrailsApprovedAt: string | null;

  firstMessageStatus: FirstMessageStatus;
  firstMessageApprovedBy: string | null;
  firstMessageApprovedAt: string | null;

  staff: StaffMember[];
  escalationOrder: string[];
  quietHoursStart: string;
  quietHoursEnd: string;
  staffAlertsEnabled: boolean;
  staffAlertsPhone: string;
  staffAlertsConsent: boolean;

  selectedTemplate: string;
  templates: MessageTemplate[];
  /** Connection card consent wording, with a {church_name} placeholder. */
  consentWording: string;

  mode: "shadow" | "live" | null;
  readyCheck: Record<string, CheckStatus>;
}

export type { PolicyDetails };

export type StatePatch = Partial<OnboardingState> | ((state: OnboardingState) => Partial<OnboardingState>);
