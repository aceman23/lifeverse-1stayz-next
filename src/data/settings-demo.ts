import type { ChurchSettings } from "@/lib/church/types";
import { FAMILIES } from "@/lib/church/first-message";
import { MESSAGE_TEMPLATES } from "@/lib/onboarding/constants";
import { STAFF } from "./staff";
import { GUARDRAILS } from "./training";
import { CHURCH } from "./workspace";

// Settings for the "Try the demo" workspace. Same shape as a real church's, never saved.

export const DEMO_SETTINGS: ChurchSettings = {
  demo: true,
  isOwner: true,
  intakeKeys: [
    { id: "k1", label: "Subsplash", prefix: "isk_3f9a2c1e", createdAt: "2026-10-12T15:00:00Z", lastUsedAt: "2026-10-25T15:42:00Z", revokedAt: null },
  ],
  profile: {
    name: CHURCH.name,
    phone: CHURCH.phone,
    website: CHURCH.website,
    address: CHURCH.address,
    timezone: CHURCH.timezone,
    denomination: CHURCH.denomination,
    averageAttendance: String(CHURCH.averageAttendance),
  },
  services: [
    { id: "sv1", name: "Traditional", day: "Sunday", startTime: "09:00", endTime: "10:15" },
    { id: "sv2", name: "Contemporary", day: "Sunday", startTime: "10:30", endTime: "11:45" },
    { id: "sv3", name: "Student Night", day: "Wednesday", startTime: "18:30", endTime: "20:00" },
  ],
  guardrails: {
    tone: ["Warm", "Pastoral"],
    signOff: "The welcome team at Grace Community",
    positions: GUARDRAILS.map((g) => ({ id: g.id, topic: g.topic, stance: g.stance, wording: "" })),
    escalationTopics: [
      { id: "e1", label: "Crisis & safety", enabled: true },
      { id: "e2", label: "Grief & loss", enabled: true },
      { id: "e3", label: "Benevolence requests", enabled: true },
      { id: "e4", label: "Marriage & family", enabled: false },
    ],
    approvedBy: "Ray Mitchell",
    approvedAt: "2026-10-12T15:00:00Z",
  },
  staff: STAFF.map((s, i) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    mobile: s.phone,
    email: s.email,
    receivesEscalations: i !== 1,
    receivesCare: i === 2,
    receivesGeneral: i === 1,
    escalationRank: i === 0 ? 1 : i === 2 ? 2 : null,
  })),
  quietHours: { start: "21:00", end: "08:00" },
  staffAlerts: { enabled: true, phone: "(555) 010-2000", consent: true },
  firstMessage: {
    templateName: MESSAGE_TEMPLATES[0].name,
    body: MESSAGE_TEMPLATES[0].body,
    status: "approved",
    approvedBy: "Ray Mitchell",
    approvedAt: "2026-10-12T15:05:00Z",
    review: { verdict: "pass", labels: [], model: "demo", reviewedAt: "2026-10-12T15:00:00Z" },
  },
  guardrailHistory: [
    {
      version: 2,
      approvedBy: "Ray Mitchell",
      approvedAt: "2026-10-28T16:00:00Z",
      first: false,
      changes: [
        { kind: "changed", area: "Belief or practice", text: "Baptism: new wording" },
        { kind: "added", area: "Goes to a person", text: "Anyone under 18" },
      ],
    },
    {
      version: 1,
      approvedBy: "Ray Mitchell",
      approvedAt: "2026-10-12T15:04:00Z",
      first: true,
      changes: [
        { kind: "added", area: "Tone", text: "Warm" },
        { kind: "added", area: "Belief or practice", text: "Baptism: answers with your wording" },
        { kind: "added", area: "Goes to a person", text: "Crisis or self-harm" },
      ],
    },
  ],
  learningConsent: {
    inTenantOnly: true,
    contributePatterns: false,
    contributeAggregates: false,
    shareDenominationFamily: false,
    trainingAuthorized: false,
    kMinimum: 5,
    addendumSignedAt: null,
  },
  firstMessageFamilies: {
    family: {
      body: FAMILIES.family.defaultBody,
      status: "approved",
      approvedBy: "Ray Mitchell",
      approvedAt: "2026-10-12T15:06:00Z",
      review: { verdict: "pass", labels: [], model: "demo", reviewedAt: "2026-10-12T15:00:00Z" },
    },
    returning: null,
  },
  integrations: {
    subsplash: "webhook",
    emailProvider: "gmail",
    smsStatus: "pending",
    emailFallbackAcknowledged: true,
    consentWordingLive: true,
  },
  ministries: ["Kids Ministry", "Students", "Small Groups"],
  mode: "shadow",
};
