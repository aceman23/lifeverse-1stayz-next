import {
  CONSENT_WORDING,
  DEFAULT_MINISTRIES,
  DOCTRINAL_TOPICS,
  ESCALATION_TOPICS,
  GUEST_FIELDS,
  MESSAGE_TEMPLATES,
  SCANNED_SERVICES,
} from "./constants";
import type { OnboardingState } from "./types";
import { computeReadyCheck } from "./validation";

export function createInitialState(): OnboardingState {
  const state: OnboardingState = {
    currentStep: 0,
    completed: false,
    church: {
      name: "",
      website: "",
      address: "",
      timezone: "America/Chicago (CT)",
      phone: "",
      yourName: "",
      yourRole: "",
    },
    siteScanned: false,
    serviceSchedule: [],
    ministries: DEFAULT_MINISTRIES.slice(0, 6),
    guestFields: GUEST_FIELDS.map((f) => f.id),
    needs: [],
    otherNeed: "",
    integrations: {
      subsplash: "none",
      email: "none",
      smsStatus: "submitted",
      emailFallbackAcknowledged: false,
      consentWordingLive: false,
      shadowSundayAcknowledged: false,
      shadowSundayCompleted: false,
    },
    documents: [],
    doctrinalPositions: DOCTRINAL_TOPICS.map((topic, i) => ({ id: `pos-${i}`, topic, stance: "route", wording: "" })),
    escalationTopics: ESCALATION_TOPICS.map((label, i) => ({ id: `esc-${i}`, label, enabled: false })),
    tone: ["Warm"],
    signOff: "",
    guardrailsApprovedBy: null,
    guardrailsApprovedAt: null,
    firstMessageStatus: "draft",
    firstMessageApprovedBy: null,
    firstMessageApprovedAt: null,
    staff: [
      {
        id: "s1",
        name: "Pastor Ray",
        role: "Senior Pastor",
        mobile: "(555) 123-4567",
        email: "ray@grace.org",
        receivesEscalations: true,
        receivesCare: true,
        receivesGeneral: true,
      },
      {
        id: "s2",
        name: "Sarah Chen",
        role: "Assimilation Director",
        mobile: "(555) 234-5678",
        email: "sarah@grace.org",
        receivesEscalations: false,
        receivesCare: true,
        receivesGeneral: true,
      },
      {
        id: "s3",
        name: "Mike Johnson",
        role: "Care Pastor",
        mobile: "(555) 345-6789",
        email: "mike@grace.org",
        receivesEscalations: true,
        receivesCare: true,
        receivesGeneral: false,
      },
    ],
    escalationOrder: ["s1", "s3"],
    quietHoursStart: "21:00",
    quietHoursEnd: "08:00",
    staffAlertsEnabled: true,
    staffAlertsPhone: "",
    staffAlertsConsent: false,
    selectedTemplate: "warm",
    templates: MESSAGE_TEMPLATES.map((t) => ({ ...t })),
    consentWording: CONSENT_WORDING,
    mode: null,
    readyCheck: {},
  };
  return { ...state, readyCheck: computeReadyCheck(state) };
}

/** Fully completed setup for `?demo=1`: Grace Community Church, parked on the Ready Check. */
export function createDemoState(): OnboardingState {
  const base = createInitialState();
  const now = new Date().toISOString();
  const state: OnboardingState = {
    ...base,
    currentStep: 7,
    church: {
      name: "Grace Community Church",
      website: "gracecommunity.org",
      address: "123 Main St, Springfield, IL 62701",
      timezone: "America/Chicago (CT)",
      phone: "(555) 123-4567",
      yourName: "Pastor Ray",
      yourRole: "Senior Pastor",
    },
    siteScanned: true,
    serviceSchedule: SCANNED_SERVICES.map((s, i) => ({ ...s, id: `svc-${i + 1}`, reviewed: true })),
    needs: ["Follow up with every first-time guest", "Get alerted when someone needs a pastor"],
    integrations: {
      ...base.integrations,
      subsplash: "qrcard",
      email: "1stayz",
      smsStatus: "approved",
      consentWordingLive: true,
    },
    signOff: "The team at Grace Community Church",
    guardrailsApprovedBy: "Pastor Ray",
    guardrailsApprovedAt: now,
    firstMessageStatus: "approved",
    firstMessageApprovedBy: "Pastor Ray",
    firstMessageApprovedAt: now,
    staffAlertsPhone: "(555) 123-4567",
    staffAlertsConsent: true,
  };
  return { ...state, readyCheck: computeReadyCheck(state) };
}
